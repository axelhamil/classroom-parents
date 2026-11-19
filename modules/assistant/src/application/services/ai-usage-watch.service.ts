import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import { type DailySpend, spendIsAbnormal } from "../../domain/usage/daily-spend";
import { usageMonthOf } from "../../domain/usage/usage-month";
import {
  type AssistantSettings,
  FAMILY_ALERT_SHARE,
  FAMILY_MONTHLY_CAP_MICRO_USD,
  OUTPUT_INVALID_ALERT_RATE,
  OUTPUT_INVALID_MIN_CALLS,
} from "../config/ai-quotas";
import type { CallOutcomes, IAiSpendReader } from "../ports/ai-spend-reader.port";
import type { AiUsageAlertKey, IAiUsageAlertLog } from "../ports/ai-usage-alert-log.port";
import type { IAiUsageRepository } from "../ports/ai-usage-repository.port";
import type { IOperatorAlerts, OperatorAlert } from "../ports/operator-alerts.port";

const HOUR_MS = 3_600_000;

const FAMILY_ALERT_MICRO_USD = FAMILY_MONTHLY_CAP_MICRO_USD * FAMILY_ALERT_SHARE;

export interface WatchReport {
  alerts: number;
  families: number;
}

const dollars = (microUsd: number): string => `${(microUsd / 1_000_000).toFixed(2)} $`;

function familyAlert(userId: string, month: string): OperatorAlert {
  return {
    key: `family_cap:${month}:${userId}`,
    subject: "AI: a family passed 80 % of its monthly cap",
    lines: [
      `Family ${userId} spent more than ${dollars(FAMILY_ALERT_MICRO_USD)} of AI in ${month}.`,
      `Its on-demand features stop at ${dollars(FAMILY_MONTHLY_CAP_MICRO_USD)}.`,
    ],
  };
}

function spendAlert(day: string, spend: DailySpend): OperatorAlert {
  return {
    key: `global_spend:${day}`,
    subject: "AI: abnormal global spend, on-demand features paused",
    lines: [
      `Spend on ${day}: ${dollars(spend.todayMicroUsd)}.`,
      `Previous 7 days: ${dollars(spend.previousSevenDaysMicroUsd)}.`,
      "On-demand features are paused and the extraction runs without escalation until it calms down.",
    ],
  };
}

function outputInvalidAlert(hour: string, outcomes: CallOutcomes): OperatorAlert {
  return {
    key: `output_invalid:${hour}`,
    subject: "AI: more than 5 % of model outputs are invalid",
    lines: [
      `${outcomes.outputInvalid} invalid outputs out of ${outcomes.calls} calls in the hour before ${hour}.`,
      "Check the provider status and the last prompt or schema change.",
    ],
  };
}

function outputInvalidTooOften({ calls, outputInvalid }: CallOutcomes): boolean {
  return calls >= OUTPUT_INVALID_MIN_CALLS && outputInvalid / calls > OUTPUT_INVALID_ALERT_RATE;
}

export class AiUsageWatchService {
  constructor(
    private readonly usage: IAiUsageRepository,
    private readonly spend: IAiSpendReader,
    private readonly alertLog: IAiUsageAlertLog,
    private readonly alerts: IOperatorAlerts,
    private readonly transactions: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: AssistantSettings,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async watch(): Promise<Result<WatchReport, AppError>> {
    return this.instrumentation.startSpan(
      { name: "AiUsageWatchService > watch", op: "function" },
      async () => {
        const now = this.clock();

        const families = await this.watchFamilies(now);
        if (families.isFailure) return Result.fail(families.getError());

        const spend = await this.watchSpend(now);
        if (spend.isFailure) return Result.fail(spend.getError());

        const outputs = await this.watchOutputs(now);
        if (outputs.isFailure) return Result.fail(outputs.getError());

        const spread = await this.reportCostSpread(now);
        if (spread.isFailure) return Result.fail(spread.getError());

        return Result.ok({
          alerts: families.getValue() + spend.getValue() + outputs.getValue(),
          families: spread.getValue(),
        });
      },
    );
  }

  private async watchFamilies(now: Date): Promise<Result<number, AppError>> {
    const { month } = usageMonthOf(now);

    const families = await this.usage.familiesFrom(month, FAMILY_ALERT_MICRO_USD);
    if (families.isFailure) return Result.fail(families.getError());

    let sent = 0;
    for (const userId of families.getValue()) {
      const key: AiUsageAlertKey = {
        kind: "family_cap",
        period: month,
        userId: Option.some(userId),
      };
      const alerted = await this.alertOnce(key, familyAlert(userId, month));
      if (alerted.isFailure) return Result.fail(alerted.getError());
      if (alerted.getValue()) sent += 1;
    }

    return Result.ok(sent);
  }

  private async watchSpend(now: Date): Promise<Result<number, AppError>> {
    const spend = await this.spend.dailySpend(now);
    if (spend.isFailure) return Result.fail(spend.getError());
    if (!spendIsAbnormal(spend.getValue(), this.settings.dailySpendCapMicroUsd))
      return Result.ok(0);

    const day = now.toISOString().slice(0, 10);
    const key: AiUsageAlertKey = { kind: "global_spend", period: day, userId: Option.none() };
    const alerted = await this.alertOnce(key, spendAlert(day, spend.getValue()));

    return alerted.map((sent) => (sent ? 1 : 0));
  }

  private async watchOutputs(now: Date): Promise<Result<number, AppError>> {
    const outcomes = await this.spend.outcomesSince(new Date(now.getTime() - HOUR_MS));
    if (outcomes.isFailure) return Result.fail(outcomes.getError());
    if (!outputInvalidTooOften(outcomes.getValue())) return Result.ok(0);

    const hour = `${now.toISOString().slice(0, 13)}:00Z`;
    const key: AiUsageAlertKey = { kind: "output_invalid", period: hour, userId: Option.none() };
    const alerted = await this.alertOnce(key, outputInvalidAlert(hour, outcomes.getValue()));

    return alerted.map((sent) => (sent ? 1 : 0));
  }

  private async reportCostSpread(now: Date): Promise<Result<number, AppError>> {
    const spread = await this.usage.costSpread(usageMonthOf(now).month);
    if (spread.isFailure) return Result.fail(spread.getError());

    const { families, p50MicroUsd, p95MicroUsd } = spread.getValue();
    this.instrumentation.setSpanAttributes({
      "ai.family_cost.families": families,
      "ai.family_cost.p50_micro_usd": p50MicroUsd,
      "ai.family_cost.p95_micro_usd": p95MicroUsd,
    });
    return Result.ok(families);
  }

  private alertOnce(
    key: AiUsageAlertKey,
    alert: OperatorAlert,
  ): Promise<Result<boolean, AppError>> {
    return this.transactions.run(async (): Promise<Result<boolean, AppError>> => {
      const claimed = await this.alertLog.claim(key);
      if (claimed.isFailure) return Result.fail(claimed.getError());
      if (!claimed.getValue()) return Result.ok(false);

      const sent = await this.alerts.notify(alert);
      return sent.map(() => true);
    });
  }
}

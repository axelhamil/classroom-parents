import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IAiSpendReader } from "../application/ports/ai-spend-reader.port";
import type { IAiUsageAlertLog } from "../application/ports/ai-usage-alert-log.port";
import type { IAiUsageRepository } from "../application/ports/ai-usage-repository.port";
import type { IOperatorAlerts } from "../application/ports/operator-alerts.port";
import { AiUsageWatchService } from "../application/services/ai-usage-watch.service";

const NOW = new Date("2026-11-19T10:20:00.000Z");
const DAILY_CAP = 20_000_000;

let usage: PortMock<IAiUsageRepository>;
let spend: PortMock<IAiSpendReader>;
let alertLog: PortMock<IAiUsageAlertLog>;
let alerts: PortMock<IOperatorAlerts>;
let service: AiUsageWatchService;

beforeEach(() => {
  usage = mockPort<IAiUsageRepository>();
  spend = mockPort<IAiSpendReader>();
  alertLog = mockPort<IAiUsageAlertLog>();
  alerts = mockPort<IOperatorAlerts>();

  usage.familiesFrom.mockResolvedValue(Result.ok([]));
  usage.costSpread.mockResolvedValue(
    Result.ok({ families: 3, p50MicroUsd: 20_000, p95MicroUsd: 130_000 }),
  );
  spend.dailySpend.mockResolvedValue(
    Result.ok({ todayMicroUsd: 300_000, previousSevenDaysMicroUsd: 2_100_000 }),
  );
  spend.outcomesSince.mockResolvedValue(Result.ok({ calls: 100, outputInvalid: 1 }));
  alertLog.claim.mockResolvedValue(Result.ok(true));
  alerts.notify.mockResolvedValue(Result.ok());

  service = new AiUsageWatchService(
    usage,
    spend,
    alertLog,
    alerts,
    mockUnitOfWork().unitOfWork,
    mockInstrumentation(),
    { dailySpendCapMicroUsd: DAILY_CAP },
    () => NOW,
  );
});

describe("operator alerts on AI spend", () => {
  it("given a family past 80 % of its cap, then the operator is told once for the month", async () => {
    usage.familiesFrom.mockResolvedValue(Result.ok(["parent-1"]));

    const report = await service.watch();

    expect(usage.familiesFrom).toHaveBeenCalledWith("2026-11-01", 200_000);
    expect(alertLog.claim).toHaveBeenCalledWith({
      kind: "family_cap",
      period: "2026-11-01",
      userId: Option.some("parent-1"),
    });
    expect(alerts.notify).toHaveBeenCalledTimes(1);
    expect(report.getValue()).toEqual({ alerts: 1, families: 3 });
  });

  it("given an alert already sent for that period, then the operator is not told again", async () => {
    usage.familiesFrom.mockResolvedValue(Result.ok(["parent-1"]));
    alertLog.claim.mockResolvedValue(Result.ok(false));

    await service.watch();

    expect(alerts.notify).not.toHaveBeenCalled();
  });

  it("given more than 5 % invalid outputs in the last hour, then the operator is told for that hour", async () => {
    spend.outcomesSince.mockResolvedValue(Result.ok({ calls: 40, outputInvalid: 3 }));

    await service.watch();

    expect(spend.outcomesSince).toHaveBeenCalledWith(new Date("2026-11-19T09:20:00.000Z"));
    expect(alertLog.claim).toHaveBeenCalledWith({
      kind: "output_invalid",
      period: "2026-11-19T10:00Z",
      userId: Option.none(),
    });
  });

  it("given a handful of calls, then a single invalid output raises nothing", async () => {
    spend.outcomesSince.mockResolvedValue(Result.ok({ calls: 5, outputInvalid: 1 }));

    await service.watch();

    expect(alerts.notify).not.toHaveBeenCalled();
  });

  it("given an abnormal global spend, then the operator is told once that day", async () => {
    spend.dailySpend.mockResolvedValue(
      Result.ok({ todayMicroUsd: DAILY_CAP + 1, previousSevenDaysMicroUsd: 2_100_000 }),
    );

    await service.watch();

    expect(alertLog.claim).toHaveBeenCalledWith({
      kind: "global_spend",
      period: "2026-11-19",
      userId: Option.none(),
    });
  });
});

import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { LlmFeature } from "@packages/llm/contract/language-model.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IAiSpendReader } from "../application/ports/ai-spend-reader.port";
import type { IAiUsageRepository } from "../application/ports/ai-usage-repository.port";
import { AiQuotaService } from "../application/services/ai-quota.service";
import type { FeatureUsage, MonthlyUsage } from "../domain/usage/quota-policy";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const NOVEMBER = "2026-11-01";
const DAILY_CAP = 20_000_000;
const QUIET_SPEND = { todayMicroUsd: 300_000, previousSevenDaysMicroUsd: 2_100_000 };

let usage: PortMock<IAiUsageRepository>;
let spend: PortMock<IAiSpendReader>;
let outbox: PortMock<IOutboxRepository>;
let service: AiQuotaService;

beforeEach(() => {
  usage = mockPort<IAiUsageRepository>();
  spend = mockPort<IAiSpendReader>();
  outbox = mockPort<IOutboxRepository>();

  usage.monthOf.mockResolvedValue(Result.ok({}));
  usage.add.mockResolvedValue(Result.ok());
  spend.dailySpend.mockResolvedValue(Result.ok(QUIET_SPEND));

  service = new AiQuotaService(
    usage,
    spend,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    { dailySpendCapMicroUsd: DAILY_CAP },
    () => NOW,
  );
});

function used(calls: number, escalations: number, costMicroUsd: number): FeatureUsage {
  return { calls, escalations, costMicroUsd };
}

function usageOfMonth(month: MonthlyUsage<LlmFeature>): void {
  usage.monthOf.mockResolvedValue(Result.ok(month));
}

const ask = (feature: LlmFeature, escalation = false) => ({ userId: PARENT, feature, escalation });

describe("monthly quotas of a family", () => {
  it("given 10 documents read this month, then the 11th is refused with the day it comes back", async () => {
    usageOfMonth({ document_reading: used(10, 0, 8_000) });

    const result = await service.admit(ask("document_reading"));

    expect(result.getError().code).toBe("AI_BUDGET_EXHAUSTED");
    expect(result.getError().metadata).toEqual({
      feature: "document_reading",
      resumesOn: "2026-12-01",
    });
    expect(usage.monthOf).toHaveBeenCalledWith(PARENT, NOVEMBER);
  });

  it("given 9 documents read, then the 10th is admitted", async () => {
    usageOfMonth({ document_reading: used(9, 0, 7_000) });

    expect((await service.admit(ask("document_reading"))).isSuccess).toBe(true);
  });

  it("given 3 escalations on documents, then a 4th escalation is refused while a plain read still passes", async () => {
    usageOfMonth({ document_reading: used(6, 3, 40_000) });

    expect((await service.admit(ask("document_reading", true))).isFailure).toBe(true);
    expect((await service.admit(ask("document_reading"))).isSuccess).toBe(true);
  });

  it("given a family at its 0.25 $ monthly cap, then every on-demand feature is refused", async () => {
    usageOfMonth({
      announcement_extraction: used(400, 20, 80_000),
      document_reading: used(8, 2, 49_000),
      translation: used(100, 0, 21_000),
      quick_add: used(10, 0, 100_000),
    });

    expect((await service.admit(ask("translation"))).getError().code).toBe("AI_BUDGET_EXHAUSTED");
  });

  it("given a family far above every cap, then the announcement reading still runs, only its escalation stops", async () => {
    usageOfMonth({ announcement_extraction: used(900, 60, 400_000) });

    expect((await service.admit(ask("announcement_extraction"))).isSuccess).toBe(true);
    expect((await service.admit(ask("announcement_extraction", true))).getError().code).toBe(
      "AI_BUDGET_EXHAUSTED",
    );
  });

  it("given an announcement reading at Haiku, then it is admitted without reading any usage", async () => {
    expect((await service.admit(ask("announcement_extraction"))).isSuccess).toBe(true);
    expect(usage.monthOf).not.toHaveBeenCalled();
  });
});

describe("global spend breaker", () => {
  it("given a day spending over the cap, then on-demand features and escalations pause while plain extraction runs", async () => {
    spend.dailySpend.mockResolvedValue(
      Result.ok({ todayMicroUsd: DAILY_CAP + 1, previousSevenDaysMicroUsd: 2_100_000 }),
    );

    expect((await service.admit(ask("quick_add"))).getError().code).toBe("AI_UNAVAILABLE");
    expect((await service.admit(ask("announcement_extraction", true))).getError().code).toBe(
      "AI_UNAVAILABLE",
    );
    expect((await service.admit(ask("announcement_extraction"))).isSuccess).toBe(true);
  });

  it("given today spending more than twice the average of the last 7 days, then on-demand features pause", async () => {
    spend.dailySpend.mockResolvedValue(
      Result.ok({ todayMicroUsd: 5_000_000, previousSevenDaysMicroUsd: 14_000_000 }),
    );

    expect((await service.admit(ask("translation"))).getError().code).toBe("AI_UNAVAILABLE");
  });

  it("given a small day above twice a tiny average, then nothing pauses below the 1 $ floor", async () => {
    spend.dailySpend.mockResolvedValue(
      Result.ok({ todayMicroUsd: 900_000, previousSevenDaysMicroUsd: 700_000 }),
    );

    expect((await service.admit(ask("translation"))).isSuccess).toBe(true);
  });

  it("reads the global spend at most once a minute", async () => {
    await service.admit(ask("translation"));
    await service.admit(ask("quick_add"));

    expect(spend.dailySpend).toHaveBeenCalledTimes(1);
  });
});

describe("recording what a call cost", () => {
  it("adds the call to the family's month, an escalation counted apart", async () => {
    usageOfMonth({ document_reading: used(1, 1, 13_000) });

    await service.record({ ...ask("document_reading", true), costMicroUsd: 13_000 });

    expect(usage.add).toHaveBeenCalledWith(
      PARENT,
      NOVEMBER,
      "document_reading",
      used(1, 1, 13_000),
    );
  });

  it("given a call that cost nothing, then no quota is used", async () => {
    await service.record({ ...ask("document_reading"), costMicroUsd: 0 });

    expect(usage.add).not.toHaveBeenCalled();
  });

  it("given the 10th document of the month, then the quota is announced exhausted once", async () => {
    usageOfMonth({ document_reading: used(10, 0, 8_000) });

    await service.record({ ...ask("document_reading"), costMicroUsd: 800 });

    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        eventType: EventTypes.ASSISTANT_QUOTA_EXHAUSTED,
        payload: {
          userId: PARENT,
          feature: "document_reading",
          month: NOVEMBER,
          resumesOn: "2026-12-01",
          actorUserId: null,
        },
      }),
    ]);
  });

  it("given a document that leaves the quota open, then nothing is announced", async () => {
    usageOfMonth({ document_reading: used(5, 0, 4_000) });

    await service.record({ ...ask("document_reading"), costMicroUsd: 800 });

    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

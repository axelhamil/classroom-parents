import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { MAX_EMAIL_FAILURES } from "../application/config/dispatch-budget";
import type { IAlertEmailSender } from "../application/ports/alert-email-sender.port";
import type { AlertsError } from "../application/ports/alert-repository.port";
import type {
  DigestDeadline,
  IDigestAudience,
  IDigestDeadlines,
} from "../application/ports/digest-audience.port";
import type { IPushSender } from "../application/ports/push-sender.port";
import type {
  IPushSubscriptionRepository,
  PushSubscriptionRecord,
} from "../application/ports/push-subscription-repository.port";
import type {
  ClaimedDigest,
  IWeeklyDigestRepository,
} from "../application/ports/weekly-digest-repository.port";
import {
  DIGEST_PLAN_BATCH,
  WeeklyDigestService,
} from "../application/services/weekly-digest.service";
import { PARENT, paris } from "../testing/alert.fixture";

const DIGEST_ID = "0196a000-0000-7000-8000-0000000000d1";
const WEEK = "2026-11-16";
const SUNDAY_EVENING = paris("2026-11-15", "18:00");
const MONDAY = paris("2026-11-16", "00:00");
const LEA = "0196a000-0000-7000-8000-00000000000a";
const HUGO = "0196a000-0000-7000-8000-00000000000b";

const PHONE: PushSubscriptionRecord = {
  id: "0196a000-0000-7000-8000-0000000000b1",
  userId: PARENT,
  endpoint: "https://push.example.com/phone",
  p256dh: "p256dh-key",
  auth: "auth-secret",
};

function deadline(
  childId: string,
  childLabel: string,
  title: string,
  date: string,
): DigestDeadline {
  return { title, childId, childLabel, deadlineAt: paris(date, "08:00"), deadlineDate: date };
}

const FAMILY_WEEK: DigestDeadline[] = [
  deadline(HUGO, "Hugo", "Exposé", "2026-11-18"),
  deadline(LEA, "Léa", "Contrôle", "2026-11-19"),
  deadline(LEA, "Léa", "Piscine", "2026-11-16"),
  deadline(HUGO, "Hugo", "Sortie", "2026-11-20"),
  deadline(HUGO, "Hugo", "Dictée", "2026-11-21"),
];

let digests: PortMock<IWeeklyDigestRepository>;
let audience: PortMock<IDigestAudience>;
let deadlines: PortMock<IDigestDeadlines>;
let subscriptions: PortMock<IPushSubscriptionRepository>;
let push: PortMock<IPushSender>;
let email: PortMock<IAlertEmailSender>;
let outbox: PortMock<IOutboxRepository>;
let service: WeeklyDigestService;

function claimed(overrides: Partial<ClaimedDigest> = {}): ClaimedDigest {
  return {
    lease: { digestId: DIGEST_ID, attempts: 1 },
    userId: PARENT,
    weekStart: WEEK,
    expiresAt: MONDAY,
    failures: 0,
    ...overrides,
  };
}

function givenClaimed(overrides: Partial<ClaimedDigest> = {}): void {
  digests.claimDue.mockResolvedValue(Result.ok([claimed(overrides)]));
}

function settlement() {
  return digests.settle.mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  digests = mockPort<IWeeklyDigestRepository>();
  audience = mockPort<IDigestAudience>();
  deadlines = mockPort<IDigestDeadlines>();
  subscriptions = mockPort<IPushSubscriptionRepository>();
  push = mockPort<IPushSender>();
  email = mockPort<IAlertEmailSender>();
  outbox = mockPort<IOutboxRepository>();

  audience.awaiting.mockResolvedValue(Result.ok([]));
  audience.emailOf.mockResolvedValue(Result.ok(Option.some("parent@example.com")));
  digests.plan.mockResolvedValue(Result.ok(0));
  digests.claimDue.mockResolvedValue(Result.ok([]));
  digests.settle.mockResolvedValue(Result.ok(true));
  digests.addFailure.mockResolvedValue(Result.ok(true));
  digests.enabledFor.mockResolvedValue(Result.ok(Option.none()));
  deadlines.within.mockResolvedValue(Result.ok(FAMILY_WEEK));
  subscriptions.listForUser.mockResolvedValue(Result.ok([PHONE]));
  push.send.mockResolvedValue(Result.ok());
  email.sendDigest.mockResolvedValue(Result.ok());

  service = new WeeklyDigestService(
    digests,
    audience,
    deadlines,
    subscriptions,
    push,
    email,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    "https://app.example.com",
  );
});

describe("planning the Sunday digest", () => {
  it("given Sunday before 18:00 in Paris, then no parent is planned", async () => {
    await service.runOnce(paris("2026-11-15", "17:59"));

    expect(audience.awaiting).not.toHaveBeenCalled();
    expect(digests.plan).not.toHaveBeenCalled();
  });

  it("given a weekday evening, then no parent is planned", async () => {
    await service.runOnce(paris("2026-11-16", "18:30"));

    expect(audience.awaiting).not.toHaveBeenCalled();
  });

  it("given Sunday 18:00 in Paris, then the parents awaiting the coming Monday to Sunday week are planned once, expiring when the week starts", async () => {
    audience.awaiting.mockResolvedValue(Result.ok([PARENT]));

    await service.runOnce(SUNDAY_EVENING);

    expect(audience.awaiting).toHaveBeenCalledWith(
      { weekStart: WEEK, from: MONDAY, to: paris("2026-11-23", "00:00") },
      DIGEST_PLAN_BATCH,
    );
    expect(digests.plan).toHaveBeenCalledWith([PARENT], WEEK, MONDAY);
  });

  it("given the Sunday clocks go back, then the week starts at Paris midnight in winter time", async () => {
    await service.runOnce(new Date("2026-10-25T17:00:00.000Z"));

    expect(audience.awaiting.mock.calls[0]?.[0]).toEqual({
      weekStart: "2026-10-26",
      from: new Date("2026-10-25T23:00:00.000Z"),
      to: new Date("2026-11-01T23:00:00.000Z"),
    });
  });

  it("given the Sunday clocks go forward, then 18:00 is read in summer time and the week starts at Paris midnight", async () => {
    await service.runOnce(new Date("2026-03-29T15:59:00.000Z"));
    expect(audience.awaiting).not.toHaveBeenCalled();

    await service.runOnce(new Date("2026-03-29T16:00:00.000Z"));
    expect(audience.awaiting.mock.calls[0]?.[0]).toEqual({
      weekStart: "2026-03-30",
      from: new Date("2026-03-29T22:00:00.000Z"),
      to: new Date("2026-04-05T22:00:00.000Z"),
    });
  });
});

describe("sending a planned digest", () => {
  it("given deadlines for two children, then one push titled Votre semaine counts them per child and names the next one", async () => {
    givenClaimed();

    const result = await service.runOnce(SUNDAY_EVENING);

    expect(result.getValue()).toMatchObject({ claimed: 1, sent: 1, emailed: 0 });
    expect(deadlines.within).toHaveBeenCalledWith(PARENT, MONDAY, paris("2026-11-23", "00:00"));
    expect(push.send.mock.calls[0]?.[1]).toEqual({
      title: "Votre semaine",
      body: "5 échéances cette semaine : 2 pour Léa, 3 pour Hugo. Prochaine : Piscine lundi.",
      url: "https://app.example.com/",
    });
    expect(settlement()).toEqual({ status: "sent", channel: "push", at: SUNDAY_EVENING });
    expect(email.sendDigest).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.WEEKLY_DIGEST_SENT,
        aggregateId: DIGEST_ID,
        payload: {
          userId: PARENT,
          digestId: DIGEST_ID,
          weekStart: WEEK,
          channel: "push",
          deadlines: 5,
          actorUserId: null,
        },
      },
    ]);
  });

  it("given one deadline of one child, then the summary is singular and names the child", async () => {
    givenClaimed();
    deadlines.within.mockResolvedValue(Result.ok([deadline(LEA, "Léa", "Piscine", "2026-11-17")]));

    await service.runOnce(SUNDAY_EVENING);

    expect(push.send.mock.calls[0]?.[1].body).toBe(
      "1 échéance cette semaine pour Léa. Prochaine : Piscine mardi.",
    );
  });

  it("given no live push subscription, then the digest goes out by email", async () => {
    givenClaimed();
    subscriptions.listForUser.mockResolvedValue(Result.ok([]));

    const result = await service.runOnce(SUNDAY_EVENING);

    expect(result.getValue()).toMatchObject({ sent: 0, emailed: 1 });
    expect(email.sendDigest).toHaveBeenCalledWith("parent@example.com", {
      digestId: DIGEST_ID,
      summary: "5 échéances cette semaine : 2 pour Léa, 3 pour Hugo. Prochaine : Piscine lundi.",
      appUrl: "https://app.example.com/",
    });
    expect(settlement()).toEqual({ status: "sent", channel: "email", at: SUNDAY_EVENING });
  });

  it("given the parent turned the digest off after planning, then it is skipped without any message", async () => {
    givenClaimed();
    digests.enabledFor.mockResolvedValue(Result.ok(Option.some(false)));

    await service.runOnce(SUNDAY_EVENING);

    expect(push.send).not.toHaveBeenCalled();
    expect(email.sendDigest).not.toHaveBeenCalled();
    expect(settlement()).toEqual({ status: "skipped" });
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.WEEKLY_DIGEST_SKIPPED,
      payload: { reason: "opted_out", actorUserId: null },
    });
  });

  it("given no deadline is left in the week, then no digest is sent", async () => {
    givenClaimed();
    deadlines.within.mockResolvedValue(Result.ok([]));

    await service.runOnce(SUNDAY_EVENING);

    expect(push.send).not.toHaveBeenCalled();
    expect(settlement()).toEqual({ status: "skipped" });
    expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ reason: "no_deadline" });
  });

  it("given the week already started, then the digest is given up, never sent late", async () => {
    givenClaimed();

    const result = await service.runOnce(MONDAY);

    expect(result.getValue()).toMatchObject({ missed: 1 });
    expect(push.send).not.toHaveBeenCalled();
    expect(settlement()).toEqual({ status: "missed" });
    expect(enqueuedEvents(outbox)[0]?.eventType).toBe(EventTypes.WEEKLY_DIGEST_MISSED);
  });

  it("given another instance settled the digest first, then no event is emitted", async () => {
    givenClaimed();
    digests.settle.mockResolvedValue(Result.ok(false));

    await service.runOnce(SUNDAY_EVENING);

    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("email fallback failures", () => {
  beforeEach(() => {
    subscriptions.listForUser.mockResolvedValue(Result.ok([]));
  });

  function givenEmailFails(code: AlertsError["code"]): void {
    email.sendDigest.mockResolvedValue(
      Result.fail<void, AlertsError>({ code, message: "refused" }),
    );
  }

  it("given a transient provider failure, then the failure is counted and the digest stays pending", async () => {
    givenClaimed();
    givenEmailFails("ALERT_PROVIDER_FAILURE");

    await service.runOnce(SUNDAY_EVENING);

    expect(digests.addFailure).toHaveBeenCalledTimes(1);
    expect(digests.settle).not.toHaveBeenCalled();
  });

  it("given the last allowed failure, then the digest is given up", async () => {
    givenClaimed({ failures: MAX_EMAIL_FAILURES - 1 });
    givenEmailFails("ALERT_PROVIDER_FAILURE");

    await service.runOnce(SUNDAY_EVENING);

    expect(settlement()).toEqual({ status: "missed" });
  });

  it("given an invalid address, then the digest is given up at once", async () => {
    givenClaimed();
    givenEmailFails("ALERT_EMAIL_INVALID");

    await service.runOnce(SUNDAY_EVENING);

    expect(settlement()).toEqual({ status: "missed" });
  });

  it("given email is not configured, then the digest stays pending without counting a failure", async () => {
    givenClaimed();
    givenEmailFails("ALERT_EMAIL_UNAVAILABLE");

    await service.runOnce(SUNDAY_EVENING);

    expect(digests.addFailure).not.toHaveBeenCalled();
    expect(digests.settle).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mondayOf, shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import {
  DISPATCH_BATCH,
  DISPATCH_LEASE_SECONDS,
  MAX_EMAIL_FAILURES,
} from "../application/config/dispatch-budget";
import type { IAlertEmailSender } from "../application/ports/alert-email-sender.port";
import type { AlertsError } from "../application/ports/alert-repository.port";
import type {
  DigestDeadline,
  IDigestAudience,
  IDigestDeadlines,
} from "../application/ports/digest-audience.port";
import type { IParentTimeZone } from "../application/ports/parent-time-zone.port";
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
import { I18nPushCopy } from "../infrastructure/adapters/i18n-push.copy";
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
let timeZones: PortMock<IParentTimeZone>;
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
  timeZones = mockPort<IParentTimeZone>();

  timeZones.of.mockResolvedValue(PARIS_TIME_ZONE);
  audience.awaiting.mockResolvedValue(Result.ok([]));
  audience.emailOf.mockResolvedValue(Result.ok(Option.some("parent@example.com")));
  digests.plan.mockResolvedValue(Result.ok(0));
  digests.claimDue.mockResolvedValue(Result.ok([]));
  digests.settle.mockResolvedValue(Result.ok(true));
  digests.addFailure.mockResolvedValue(Result.ok(true));
  digests.enabledFor.mockResolvedValue(Result.ok(Option.none()));
  deadlines.within.mockResolvedValue(Result.ok(FAMILY_WEEK));
  subscriptions.listForUser.mockResolvedValue(Result.ok([PHONE]));
  subscriptions.lockScreenDetailsFor.mockResolvedValue(Result.ok(Option.some(true)));
  push.send.mockResolvedValue(Result.ok());
  email.sendDigest.mockResolvedValue(Result.ok());

  service = new WeeklyDigestService(
    digests,
    audience,
    deadlines,
    timeZones,
    subscriptions,
    push,
    email,
    new I18nPushCopy(),
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    "https://app.example.com",
  );
});

const inZone = (timeZone: string) => (date: string, time: string) =>
  zonedWallTimeToUtc(date, time, timeZone).unwrapOr(new Date(Number.NaN));

describe("planning the Sunday digest", () => {
  it("given a Sunday before 18:00 in every zone of the world, then no parent is planned", async () => {
    await service.runOnce(new Date("2026-11-15T03:59:00.000Z"));

    expect(audience.awaiting).not.toHaveBeenCalled();
    expect(digests.plan).not.toHaveBeenCalled();
  });

  it("given a Monday once midnight has passed in every zone, then no parent is planned", async () => {
    await service.runOnce(new Date("2026-11-16T12:00:00.000Z"));

    expect(audience.awaiting).not.toHaveBeenCalled();
  });

  it("given Sunday 18:00 in Paris, then a Paris parent is planned once, due at 18:00 and expiring when the Paris week starts", async () => {
    audience.awaiting.mockResolvedValue(Result.ok([PARENT]));

    await service.runOnce(SUNDAY_EVENING);

    expect(audience.awaiting).toHaveBeenCalledWith(
      {
        weekStart: WEEK,
        from: new Date("2026-11-15T10:00:00.000Z"),
        to: new Date("2026-11-23T12:00:00.000Z"),
      },
      DIGEST_PLAN_BATCH,
    );
    expect(digests.plan).toHaveBeenCalledWith(
      [{ userId: PARENT, dueAt: SUNDAY_EVENING, expiresAt: MONDAY }],
      WEEK,
    );
    expect(digests.claimDue).toHaveBeenCalledWith(
      SUNDAY_EVENING,
      DISPATCH_BATCH,
      DISPATCH_LEASE_SECONDS,
    );
  });

  it.each([
    ["Montreal", "America/Toronto"],
    ["Casablanca", "Africa/Casablanca"],
  ])(
    "given a parent in %s, then the digest is due on Sunday at 18:00 there and expires at Monday midnight there",
    async (_city, timeZone) => {
      const local = inZone(timeZone);
      timeZones.of.mockResolvedValue(timeZone);
      audience.awaiting.mockResolvedValue(Result.ok([PARENT]));

      await service.runOnce(new Date("2026-11-15T12:00:00.000Z"));

      expect(digests.plan).toHaveBeenCalledWith(
        [
          {
            userId: PARENT,
            dueAt: local("2026-11-15", "18:00"),
            expiresAt: local("2026-11-16", "00:00"),
          },
        ],
        WEEK,
      );
    },
  );

  it("given the Sunday clocks go back, then a Paris parent is due at 18:00 winter time and the week starts at Paris midnight", async () => {
    audience.awaiting.mockResolvedValue(Result.ok([PARENT]));

    await service.runOnce(new Date("2026-10-25T17:00:00.000Z"));

    expect(digests.plan.mock.calls[0]?.[0]).toEqual([
      {
        userId: PARENT,
        dueAt: new Date("2026-10-25T17:00:00.000Z"),
        expiresAt: new Date("2026-10-25T23:00:00.000Z"),
      },
    ]);
  });

  it("given the Sunday clocks go forward, then a Paris parent is due at 18:00 summer time and the week starts at Paris midnight", async () => {
    audience.awaiting.mockResolvedValue(Result.ok([PARENT]));

    await service.runOnce(new Date("2026-03-29T16:00:00.000Z"));

    expect(digests.plan.mock.calls[0]?.[0]).toEqual([
      {
        userId: PARENT,
        dueAt: new Date("2026-03-29T16:00:00.000Z"),
        expiresAt: new Date("2026-03-29T22:00:00.000Z"),
      },
    ]);
  });
});

describe("sending a planned digest", () => {
  it.each([
    ["Montreal", "America/Toronto"],
    ["Casablanca", "Africa/Casablanca"],
  ])(
    "given a parent in %s, then the digest reads the parent's Monday to Monday week and counts from the parent's today",
    async (_city, timeZone) => {
      const local = inZone(timeZone);
      timeZones.of.mockResolvedValue(timeZone);
      givenClaimed({ expiresAt: local("2026-11-16", "00:00") });

      await service.runOnce(local("2026-11-15", "18:00"));

      expect(deadlines.within).toHaveBeenCalledWith(
        PARENT,
        local("2026-11-16", "00:00"),
        local("2026-11-23", "00:00"),
      );
      expect(push.send.mock.calls[0]?.[1].body).toContain("Prochaine : Piscine, demain.");
    },
  );

  it("given deadlines for two children, then one push titled Votre semaine counts them per child and names the next one", async () => {
    givenClaimed();

    const result = await service.runOnce(SUNDAY_EVENING);

    expect(result.getValue()).toMatchObject({ claimed: 1, sent: 1, emailed: 0 });
    expect(deadlines.within).toHaveBeenCalledWith(PARENT, MONDAY, paris("2026-11-23", "00:00"));
    expect(push.send.mock.calls[0]?.[1]).toEqual({
      title: "Votre semaine",
      body: "5 échéances cette semaine : 2 pour Léa, 3 pour Hugo. Prochaine : Piscine, demain.",
      url: "https://app.example.com/",
      tag: `week-${WEEK}`,
      notificationRef: `digest:${DIGEST_ID}`,
    });
    expect(push.send.mock.calls[0]?.[2]).toMatchObject({ urgency: "normal" });
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
      "1 échéance cette semaine pour Léa. Prochaine : Piscine, mardi 17 novembre.",
    );
  });

  it("given a parent whose zone is already on Monday, then the next deadline reads today in that zone", async () => {
    givenClaimed();
    timeZones.of.mockResolvedValue("Asia/Tokyo");

    await service.runOnce(SUNDAY_EVENING);

    expect(timeZones.of).toHaveBeenCalledWith(PARENT);
    expect(push.send.mock.calls[0]?.[1].body).toEndWith("Prochaine : Piscine, aujourd'hui.");
  });

  it("given a parent who never chose to show details on the lock screen, then the push only counts the deadlines", async () => {
    givenClaimed();
    subscriptions.lockScreenDetailsFor.mockResolvedValue(Result.ok(Option.none()));

    await service.runOnce(SUNDAY_EVENING);

    expect(push.send.mock.calls[0]?.[1]).toMatchObject({
      title: "Votre semaine",
      body: "5 échéances cette semaine.",
    });
  });

  it("given no live push subscription, then the digest goes out by email", async () => {
    givenClaimed();
    subscriptions.listForUser.mockResolvedValue(Result.ok([]));

    const result = await service.runOnce(SUNDAY_EVENING);

    expect(result.getValue()).toMatchObject({ sent: 0, emailed: 1 });
    expect(email.sendDigest).toHaveBeenCalledWith("parent@example.com", {
      digestId: DIGEST_ID,
      summary: "5 échéances cette semaine : 2 pour Léa, 3 pour Hugo. Prochaine : Piscine, demain.",
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

describe("invariant: the digest counts what the app's week shows", () => {
  interface FixtureDeadline extends DigestDeadline {
    status: "confirmed" | "needs_review";
    done: boolean;
  }

  function at(
    title: string,
    date: string,
    time: string,
    status: FixtureDeadline["status"] = "confirmed",
    done = false,
  ): FixtureDeadline {
    return {
      title,
      childId: LEA,
      childLabel: "Léa",
      deadlineAt: paris(date, time),
      deadlineDate: date,
      status,
      done,
    };
  }

  const FIXTURE: FixtureDeadline[] = [
    at("Veille", "2026-11-15", "23:30"),
    at("Lundi minuit", "2026-11-16", "00:00"),
    at("Mardi", "2026-11-17", "08:30"),
    at("À vérifier", "2026-11-18", "08:30", "needs_review"),
    at("Fait", "2026-11-19", "08:30", "confirmed", true),
    at("Dimanche soir", "2026-11-22", "23:59"),
    at("Lundi suivant", "2026-11-23", "00:00"),
    at("Lundi suivant, nuit", "2026-11-23", "00:30"),
  ];

  function isAlertable({ status, done }: FixtureDeadline): boolean {
    return status === "confirmed" && !done;
  }

  function appWeekCount(today: string): number {
    const from = mondayOf(today);
    const to = shiftDate(from, 6);

    return FIXTURE.filter(
      (deadline) =>
        isAlertable(deadline) && deadline.deadlineDate >= from && deadline.deadlineDate <= to,
    ).length;
  }

  it("given one fixture, then the count the digest announces equals the app's calendar week count on that Monday, same statuses", async () => {
    givenClaimed();
    deadlines.within.mockImplementation(async (_userId, from, to) =>
      Result.ok(
        FIXTURE.filter(
          (deadline) =>
            isAlertable(deadline) && deadline.deadlineAt >= from && deadline.deadlineAt < to,
        ),
      ),
    );

    await service.runOnce(SUNDAY_EVENING);

    const announced = enqueuedEvents(outbox)[0]?.payload;
    expect(announced).toMatchObject({ deadlines: appWeekCount(WEEK) });
    expect(appWeekCount(WEEK)).toBe(3);
    expect(push.send.mock.calls[0]?.[1].body).toBe(
      "3 échéances cette semaine pour Léa. Prochaine : Lundi minuit, demain.",
    );
  });
});

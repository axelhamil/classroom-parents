import { beforeEach, describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { shiftInstant } from "@packages/ddd-kit/days";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import {
  DISPATCH_BATCH,
  DISPATCH_CONCURRENCY,
  DISPATCH_LEASE_SECONDS,
  MAX_EMAIL_FAILURES,
  worstCaseBatchMs,
} from "../application/config/dispatch-budget";
import type {
  AlertContext,
  IAlertContextReader,
} from "../application/ports/alert-context-reader.port";
import type { IAlertEmailSender } from "../application/ports/alert-email-sender.port";
import type {
  AlertsError,
  ClaimedAlert,
  IAlertRepository,
} from "../application/ports/alert-repository.port";
import type { EventDeadline, IEventDeadlines } from "../application/ports/event-deadlines.port";
import type { IPushCopy } from "../application/ports/push-copy.port";
import type { IPushSender } from "../application/ports/push-sender.port";
import type {
  IPushSubscriptionRepository,
  PushSubscriptionRecord,
} from "../application/ports/push-subscription-repository.port";
import { AlertDispatchService } from "../application/services/alert-dispatch.service";
import type { Alert } from "../domain/alert.aggregate";
import {
  ALERT_EVENT,
  ALERT_ID,
  type AlertOverrides,
  existingAlert,
  PARENT,
  paris,
} from "../testing/alert.fixture";

const DUE = paris("2026-11-13", "18:00");
const NOW = new Date(DUE.getTime() + 30_000);

const CONTEXT: AlertContext = {
  alertId: ALERT_ID,
  email: "parent@example.com",
  eventTitle: "Contrôle de maths",
  childLabel: "Léa",
  deadlineLabel: "dimanche 15 novembre",
  eventUrl: "https://app.example.com/events/0196a000-0000-7000-8000-0000000000e1",
};

const PHONE: PushSubscriptionRecord = {
  id: "0196a000-0000-7000-8000-0000000000b1",
  userId: PARENT,
  endpoint: "https://push.example.com/phone",
  p256dh: "p256dh-key",
  auth: "auth-secret",
};

let alerts: PortMock<IAlertRepository>;
let subscriptions: PortMock<IPushSubscriptionRepository>;
let push: PortMock<IPushSender>;
let email: PortMock<IAlertEmailSender>;
let contexts: PortMock<IAlertContextReader>;
let copy: PortMock<IPushCopy>;
let deadlines: PortMock<IEventDeadlines>;
let outbox: PortMock<IOutboxRepository>;
let service: AlertDispatchService;

function claimed(alert: Alert, failures = 0): ClaimedAlert {
  return {
    alert,
    lease: { alertId: alert.id.value, attempts: 1, version: alert.get("version") },
    failures,
  };
}

function givenClaimed(overrides: AlertOverrides = {}, failures = 0): Alert {
  const alert = existingAlert(overrides);
  alerts.claimDue.mockResolvedValue(
    Result.ok<ClaimedAlert[], AlertsError>([claimed(alert, failures)]),
  );
  return alert;
}

function givenSubscriptions(records: PushSubscriptionRecord[]): void {
  subscriptions.listForUser.mockResolvedValue(Result.ok(records));
}

function givenDeadline(overrides: Partial<EventDeadline>): void {
  deadlines.forUser.mockResolvedValue(
    Result.ok<Option<EventDeadline>, AppError>(
      Option.some({
        deadlineAt: paris("2026-11-15", "23:59"),
        deadlineDate: "2026-11-15",
        done: false,
        needsReview: false,
        ...overrides,
      }),
    ),
  );
}

function settledStatus(): string | undefined {
  return alerts.settle.mock.calls.at(-1)?.[0].get("status").value;
}

beforeEach(() => {
  alerts = mockPort<IAlertRepository>();
  subscriptions = mockPort<IPushSubscriptionRepository>();
  push = mockPort<IPushSender>();
  email = mockPort<IAlertEmailSender>();
  contexts = mockPort<IAlertContextReader>();
  copy = mockPort<IPushCopy>();
  deadlines = mockPort<IEventDeadlines>();
  outbox = mockPort<IOutboxRepository>();

  givenClaimed({ date: "2026-11-13", time: "18:00" });
  alerts.settle.mockResolvedValue(Result.ok(true));
  alerts.recordDelivery.mockResolvedValue(Result.ok());
  alerts.addFailure.mockResolvedValue(Result.ok(true));
  givenSubscriptions([PHONE]);
  subscriptions.deleteGone.mockResolvedValue(Result.ok());
  push.send.mockResolvedValue(Result.ok());
  email.send.mockResolvedValue(Result.ok());
  contexts.load.mockResolvedValue(Result.ok([CONTEXT]));
  copy.forAlerts.mockImplementation(async (shown) => ({
    title: shown.length === 1 ? "one" : "many",
    body: shown.map(({ eventTitle }) => eventTitle).join(" | "),
  }));
  givenDeadline({});

  service = new AlertDispatchService(
    alerts,
    subscriptions,
    push,
    email,
    contexts,
    copy,
    deadlines,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
  );
});

describe("runOnce", () => {
  it("given a due alert and one live subscription, then one push is sent, the alert is sent and no email goes out", async () => {
    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 1, sent: 1, emailed: 0, missed: 0 });
    expect(alerts.claimDue).toHaveBeenCalledWith(NOW, DISPATCH_BATCH, DISPATCH_LEASE_SECONDS);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(copy.forAlerts).toHaveBeenCalledWith([CONTEXT]);
    expect(push.send.mock.calls[0]?.[1]).toEqual({
      title: "one",
      body: "Contrôle de maths",
      url: CONTEXT.eventUrl,
      tag: `event-${ALERT_EVENT}`,
    });
    expect(push.send.mock.calls[0]?.[2]).toEqual({
      ttlSeconds: 7200,
      topic: "0196a0000000700080000000000000e1",
      urgency: "high",
    });
    expect(settledStatus()).toBe("sent");
    expect(email.send).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_SENT,
        aggregateId: ALERT_ID,
        payload: { userId: PARENT, alertId: ALERT_ID, channel: "push", actorUserId: null },
      },
    ]);
  });

  it("given the only subscription is gone, then it is deleted, PUSH_SUBSCRIPTION_EXPIRED is emitted and the email goes out", async () => {
    push.send.mockResolvedValue(Result.fail("PUSH_GONE"));

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 1, sent: 0, emailed: 1, missed: 0 });
    expect(subscriptions.deleteGone).toHaveBeenCalledWith(PARENT, PHONE.id);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.PUSH_SUBSCRIPTION_EXPIRED,
      EventTypes.ALERT_SENT,
    ]);
    expect(enqueuedEvents(outbox)[1]?.payload).toMatchObject({ channel: "email" });
  });

  it("given no subscription, then the email carries the title, the child, the deadline and the link, never the description", async () => {
    givenSubscriptions([]);

    await service.runOnce(NOW);

    expect(email.send).toHaveBeenCalledWith("parent@example.com", {
      alertId: ALERT_ID,
      version: 1,
      eventTitle: "Contrôle de maths",
      childLabel: "Léa",
      deadlineLabel: "dimanche 15 novembre",
      eventUrl: CONTEXT.eventUrl,
    });
    expect(settledStatus()).toBe("sent");
  });

  it("given the email fails, then ALERT_DELIVERY_FAILED is emitted and the alert stays claimable after its lease", async () => {
    givenSubscriptions([]);
    email.send.mockResolvedValue(
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "resend down" }),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 1, sent: 0, emailed: 0, missed: 0 });
    expect(alerts.settle).not.toHaveBeenCalled();
    expect(alerts.addFailure).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_DELIVERY_FAILED,
        aggregateId: ALERT_ID,
        payload: {
          userId: PARENT,
          alertId: ALERT_ID,
          channel: "email",
          code: "EMAIL_PROVIDER_FAILURE",
          actorUserId: null,
        },
      },
    ]);
  });

  it("given the fifth email failure of this occurrence, then the alert is missed and ALERT_MISSED is emitted", async () => {
    givenClaimed({}, 4);
    givenSubscriptions([]);
    email.send.mockResolvedValue(
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "resend down" }),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 1, sent: 0, emailed: 0, missed: 1 });
    expect(settledStatus()).toBe("missed");
    expect(enqueuedEvents(outbox).at(-1)).toEqual({
      eventType: EventTypes.ALERT_MISSED,
      aggregateId: ALERT_ID,
      payload: { userId: PARENT, alertId: ALERT_ID, actorUserId: null },
    });
  });

  it("given the provider rejects the email for good, then the alert is missed at once with ALERT_MISSED", async () => {
    givenSubscriptions([]);
    email.send.mockResolvedValue(
      Result.fail<void, AlertsError>({ code: "ALERT_EMAIL_INVALID", message: "rejected" }),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toMatchObject({ missed: 1, emailed: 0 });
    expect(settledStatus()).toBe("missed");
    expect(alerts.addFailure).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_DELIVERY_FAILED,
      EventTypes.ALERT_MISSED,
    ]);
  });

  it("given the provider refuses our configuration on the fifth failure, then the alert is not missed and stays claimable after its lease", async () => {
    givenClaimed({}, MAX_EMAIL_FAILURES - 1);
    givenSubscriptions([]);
    email.send.mockResolvedValue(
      Result.fail<void, AlertsError>({ code: "ALERT_EMAIL_UNAVAILABLE", message: "bad key" }),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toMatchObject({ missed: 0, emailed: 0 });
    expect(alerts.settle).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_DELIVERY_FAILED,
    ]);
  });

  it("given a re-armed occurrence whose earlier occurrence failed four times, then one email failure does not miss it", async () => {
    givenClaimed({ version: 2 }, 0);
    givenSubscriptions([]);
    email.send.mockResolvedValue(
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "resend down" }),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toMatchObject({ missed: 0 });
    expect(alerts.settle).not.toHaveBeenCalled();
  });

  it("given an alert due 7 hours ago, then it is missed and nothing is sent", async () => {
    const result = await service.runOnce(new Date(DUE.getTime() + 7 * 3_600_000));

    expect(result.getValue()).toMatchObject({ missed: 1, sent: 0 });
    expect(settledStatus()).toBe("missed");
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_MISSED,
    ]);
    expect(push.send).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("given a deadline already passed, then the alert is skipped and nothing is sent", async () => {
    givenClaimed({ deadlineAt: new Date(DUE.getTime() + 10_000) });

    await service.runOnce(NOW);

    expect(settledStatus()).toBe("skipped");
    expect(push.send).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_SKIPPED,
        aggregateId: ALERT_ID,
        payload: { userId: PARENT, alertId: ALERT_ID, actorUserId: null },
      },
    ]);
  });

  it("given the deadline was corrected to before the reminder, then the alert is skipped and nothing is sent", async () => {
    givenDeadline({ deadlineAt: DUE, deadlineDate: "2026-11-13", needsReview: true });

    await service.runOnce(NOW);

    expect(settledStatus()).toBe("skipped");
    expect(push.send).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("given the agenda no longer shows the event (masked by a coursework or withdrawn), then the alert is skipped", async () => {
    deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));

    await service.runOnce(NOW);

    expect(deadlines.forUser).toHaveBeenCalledWith(PARENT, ALERT_EVENT);
    expect(settledStatus()).toBe("skipped");
    expect(push.send).not.toHaveBeenCalled();
  });

  it("given the homework was turned in after the claim, then the alert is skipped with ALERT_SKIPPED and nothing is sent", async () => {
    givenDeadline({ done: true });

    await service.runOnce(NOW);

    expect(settledStatus()).toBe("skipped");
    expect(push.send).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_SKIPPED,
    ]);
  });
});

describe("grouping", () => {
  function eventId(n: number): string {
    return `0196a000-0000-7000-8000-0000000001${String(n).padStart(2, "0")}`;
  }

  function alertOf(n: number, overrides: AlertOverrides = {}): ClaimedAlert {
    return claimed(
      existingAlert({
        id: `0196a000-0000-7000-8000-0000000002${String(n).padStart(2, "0")}`,
        eventId: eventId(n),
        ...overrides,
      }),
    );
  }

  function givenBatch(batch: ClaimedAlert[]): void {
    alerts.claimDue.mockResolvedValue(Result.ok<ClaimedAlert[], AlertsError>(batch));
    contexts.load.mockResolvedValue(
      Result.ok(
        batch.map(({ alert }, n) => ({
          ...CONTEXT,
          alertId: alert.id.value,
          eventTitle: `Devoir ${n}`,
          eventUrl: `https://app.example.com/events/${alert.get("eventId")}`,
        })),
      ),
    );
  }

  it("given five deadlines of one parent due in the same window, then one notification lists them and every alert is sent", async () => {
    givenBatch([1, 2, 3, 4, 5].map((n) => alertOf(n)));

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 5, sent: 5, emailed: 0, missed: 0 });
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send.mock.calls[0]?.[1]).toEqual({
      title: "many",
      body: "Devoir 0 | Devoir 1 | Devoir 2 | Devoir 3 | Devoir 4",
      url: "https://app.example.com/",
      tag: "alerts-2026-11-13",
    });
    expect(push.send.mock.calls[0]?.[2]).toEqual({
      ttlSeconds: 7200,
      topic: "alerts20261113",
      urgency: "high",
    });
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual(
      Array(5).fill(EventTypes.ALERT_SENT),
    );
  });

  it("given two parents with a deadline each, then each parent gets their own notification", async () => {
    givenBatch([alertOf(1), alertOf(2, { userId: "parent-2" })]);
    subscriptions.listForUser.mockImplementation(async (userId) =>
      Result.ok([{ ...PHONE, userId, endpoint: `https://push.example.com/${userId}` }]),
    );

    await service.runOnce(NOW);

    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.send.mock.calls.map(([target]) => target.endpoint).toSorted()).toEqual([
      "https://push.example.com/parent-1",
      "https://push.example.com/parent-2",
    ]);
  });

  it("given two reminders of one parent due more than the window apart, then they stay two notifications", async () => {
    givenBatch([alertOf(1, { time: "17:00" }), alertOf(2, { time: "18:00" })]);

    await service.runOnce(NOW);

    expect(push.send).toHaveBeenCalledTimes(2);
    expect(push.send.mock.calls.map(([, message]) => message.tag).toSorted()).toEqual([
      `event-${eventId(1)}`,
      `event-${eventId(2)}`,
    ]);
  });

  it("given a grouped notification no device accepts, then each alert falls back to its own email", async () => {
    givenBatch([alertOf(1), alertOf(2)]);
    givenSubscriptions([]);

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 2, sent: 0, emailed: 2, missed: 0 });
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it("given one alert of the group is done meanwhile, then the notification lists only the others", async () => {
    givenBatch([alertOf(1), alertOf(2), alertOf(3)]);
    deadlines.forUser.mockImplementation(async (_user, event) =>
      Result.ok<Option<EventDeadline>, AppError>(
        Option.some({
          deadlineAt: paris("2026-11-15", "23:59"),
          deadlineDate: "2026-11-15",
          done: event === eventId(2),
          needsReview: false,
        }),
      ),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toMatchObject({ claimed: 3, sent: 2 });
    expect(push.send.mock.calls[0]?.[1].body).toBe("Devoir 0 | Devoir 2");
  });
});

describe("dispatch budget", () => {
  it("given the per-send timeouts and the batch, then the worst case of a batch stays under half the lease", () => {
    expect(worstCaseBatchMs()).toBeLessThan((DISPATCH_LEASE_SECONDS * 1000) / 2);
  });

  it("given more due alerts than the concurrency, then no more than the concurrency are sent at once", async () => {
    const batch = Array.from({ length: DISPATCH_CONCURRENCY * 2 + 3 }, (_, i) =>
      claimed(
        existingAlert({
          id: `0196a000-0000-7000-8000-${String(i).padStart(12, "0")}`,
          userId: `parent-${i}`,
        }),
      ),
    );
    alerts.claimDue.mockResolvedValue(Result.ok<ClaimedAlert[], AlertsError>(batch));
    contexts.load.mockResolvedValue(
      Result.ok(batch.map(({ alert }) => ({ ...CONTEXT, alertId: alert.id.value }))),
    );
    let inFlight = 0;
    let peak = 0;
    push.send.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return Result.ok();
    });

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toMatchObject({ sent: batch.length });
    expect(peak).toBe(DISPATCH_CONCURRENCY);
  });
});

describe("dispatch across DST (RF 1)", () => {
  it.each([
    ["the spring change", "2027-03-28", "18:00", "2027-03-28T16:00:00.000Z"],
    ["the autumn change", "2026-10-25", "18:00", "2026-10-25T17:00:00.000Z"],
  ])(
    "given an alert on %s, then nothing is sent one minute early and it is sent on time",
    async (_label, date, time, dueAt) => {
      const deadlineAt = shiftInstant(new Date(dueAt), 1);
      givenClaimed({ date, time, deadlineAt });
      givenDeadline({ deadlineAt });

      const early = await service.runOnce(new Date(Date.parse(dueAt) - 60_000));
      expect(early.getValue()).toMatchObject({ sent: 0 });
      expect(push.send).not.toHaveBeenCalled();

      const onTime = await service.runOnce(new Date(dueAt));
      expect(onTime.getValue()).toMatchObject({ sent: 1 });
      expect(push.send).toHaveBeenCalledTimes(1);
    },
  );
});

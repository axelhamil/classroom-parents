import { beforeEach, describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
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
let deadlines: PortMock<IEventDeadlines>;
let outbox: PortMock<IOutboxRepository>;
let service: AlertDispatchService;

function givenClaimed(overrides: AlertOverrides = {}, attempts = 1): Alert {
  const alert = existingAlert(overrides);
  alerts.claimDue.mockResolvedValue(
    Result.ok<ClaimedAlert[], AlertsError>([{ alert, lease: { alertId: ALERT_ID, attempts } }]),
  );
  return alert;
}

function givenSubscriptions(records: PushSubscriptionRecord[]): void {
  subscriptions.listForUser.mockResolvedValue(Result.ok(records));
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
  deadlines = mockPort<IEventDeadlines>();
  outbox = mockPort<IOutboxRepository>();

  givenClaimed({ date: "2026-11-13", time: "18:00" });
  alerts.settle.mockResolvedValue(Result.ok(true));
  alerts.recordDelivery.mockResolvedValue(Result.ok());
  givenSubscriptions([PHONE]);
  subscriptions.deleteGone.mockResolvedValue(Result.ok());
  push.send.mockResolvedValue(Result.ok());
  email.send.mockResolvedValue(Result.ok());
  contexts.load.mockResolvedValue(Result.ok([CONTEXT]));
  deadlines.forUser.mockResolvedValue(
    Result.ok<Option<EventDeadline>, AppError>(
      Option.some({ deadlineAt: paris("2026-11-15", "23:59"), deadlineDate: "2026-11-15" }),
    ),
  );

  service = new AlertDispatchService(
    alerts,
    subscriptions,
    push,
    email,
    contexts,
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
    expect(alerts.claimDue).toHaveBeenCalledWith(NOW, 50, 60);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(push.send.mock.calls[0]?.[1]).toEqual({
      web_push: 8030,
      notification: {
        title: "Contrôle de maths",
        body: "Léa, échéance dimanche 15 novembre",
        navigate: CONTEXT.eventUrl,
      },
    });
    expect(push.send.mock.calls[0]?.[2]).toEqual({
      urgency: "high",
      ttlSeconds: 7200,
      topic: "0196a0000000700080000000000000a1",
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

  it("given the fifth attempt fails, then the alert is missed", async () => {
    givenClaimed({}, 5);
    givenSubscriptions([]);
    email.send.mockResolvedValue(
      Result.fail({ code: "EMAIL_PROVIDER_FAILURE", message: "resend down" }),
    );

    const result = await service.runOnce(NOW);

    expect(result.getValue()).toEqual({ claimed: 1, sent: 0, emailed: 0, missed: 1 });
    expect(settledStatus()).toBe("missed");
  });

  it("given an alert due 7 hours ago, then it is missed and nothing is sent", async () => {
    const result = await service.runOnce(new Date(DUE.getTime() + 7 * 3_600_000));

    expect(result.getValue()).toMatchObject({ missed: 1, sent: 0 });
    expect(settledStatus()).toBe("missed");
    expect(push.send).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("given a deadline already passed, then the alert is skipped and nothing is sent", async () => {
    givenClaimed({ deadlineAt: new Date(DUE.getTime() + 10_000) });

    await service.runOnce(NOW);

    expect(settledStatus()).toBe("skipped");
    expect(push.send).not.toHaveBeenCalled();
  });

  it("given the agenda no longer shows the event (masked by a coursework or withdrawn), then the alert is skipped", async () => {
    deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));

    await service.runOnce(NOW);

    expect(deadlines.forUser).toHaveBeenCalledWith(PARENT, ALERT_EVENT);
    expect(settledStatus()).toBe("skipped");
    expect(push.send).not.toHaveBeenCalled();
  });
});

describe("dispatch across DST (RF 1)", () => {
  it.each([
    ["the spring change", "2027-03-28", "18:00", "2027-03-28T16:00:00.000Z"],
    ["the autumn change", "2026-10-25", "18:00", "2026-10-25T17:00:00.000Z"],
  ])(
    "given an alert on %s, then nothing is sent one minute early and it is sent on time",
    async (_label, date, time, dueAt) => {
      givenClaimed({ date, time, deadlineAt: new Date(Date.parse(dueAt) + 86_400_000) });

      const early = await service.runOnce(new Date(Date.parse(dueAt) - 60_000));
      expect(early.getValue()).toMatchObject({ sent: 0 });
      expect(push.send).not.toHaveBeenCalled();

      const onTime = await service.runOnce(new Date(dueAt));
      expect(onTime.getValue()).toMatchObject({ sent: 1 });
      expect(push.send).toHaveBeenCalledTimes(1);
    },
  );
});

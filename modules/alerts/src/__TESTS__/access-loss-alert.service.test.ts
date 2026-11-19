import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { MAX_EMAIL_FAILURES } from "../application/config/dispatch-budget";
import type { IAccessLossContextReader } from "../application/ports/access-loss-context.port";
import type {
  ClaimedAccessLoss,
  IAccessLossRepository,
} from "../application/ports/access-loss-repository.port";
import type { IAlertEmailSender } from "../application/ports/alert-email-sender.port";
import type { AlertsError } from "../application/ports/alert-repository.port";
import type { IPushSender } from "../application/ports/push-sender.port";
import type {
  IPushSubscriptionRepository,
  PushSubscriptionRecord,
} from "../application/ports/push-subscription-repository.port";
import type { IReminderSettingsRepository } from "../application/ports/reminder-settings.port";
import { AccessLossAlertService } from "../application/services/access-loss-alert.service";
import { I18nPushCopy } from "../infrastructure/adapters/i18n-push.copy";
import { PARENT, paris } from "../testing/alert.fixture";

const JADE = "0196a000-0000-7000-8000-00000000000a";
const WARNING = "0196a000-0000-7000-8000-0000000000c1";
const CHILD = { userId: PARENT, childId: JADE };
const AFTERNOON = paris("2026-11-19", "15:00");

const PHONE: PushSubscriptionRecord = {
  id: "0196a000-0000-7000-8000-0000000000b1",
  userId: PARENT,
  endpoint: "https://push.example.com/phone",
  p256dh: "p256dh-key",
  auth: "auth-secret",
};

const providerDown: AlertsError = { code: "ALERT_PROVIDER_FAILURE", message: "queue down" };

let losses: PortMock<IAccessLossRepository>;
let settings: PortMock<IReminderSettingsRepository>;
let contexts: PortMock<IAccessLossContextReader>;
let subscriptions: PortMock<IPushSubscriptionRepository>;
let push: PortMock<IPushSender>;
let email: PortMock<IAlertEmailSender>;
let outbox: PortMock<IOutboxRepository>;
let service: AccessLossAlertService;

function claimed(overrides: Partial<ClaimedAccessLoss> = {}): ClaimedAccessLoss {
  return { lease: { accessAlertId: WARNING, attempts: 1 }, ...CHILD, failures: 0, ...overrides };
}

function givenDue(overrides: Partial<ClaimedAccessLoss> = {}): void {
  losses.claimDue.mockResolvedValue(Result.ok([claimed(overrides)]));
}

function pushed() {
  return push.send.mock.calls.map(([, message]) => message);
}

function eventTypes(): string[] {
  return enqueuedEvents(outbox).map(({ eventType }) => eventType);
}

beforeEach(() => {
  losses = mockPort<IAccessLossRepository>();
  settings = mockPort<IReminderSettingsRepository>();
  contexts = mockPort<IAccessLossContextReader>();
  subscriptions = mockPort<IPushSubscriptionRepository>();
  push = mockPort<IPushSender>();
  email = mockPort<IAlertEmailSender>();
  outbox = mockPort<IOutboxRepository>();

  losses.open.mockResolvedValue(Result.ok(Option.some(WARNING)));
  losses.close.mockResolvedValue(Result.ok([]));
  losses.claimDue.mockResolvedValue(Result.ok([]));
  losses.settle.mockResolvedValue(Result.ok(true));
  losses.addFailure.mockResolvedValue(Result.ok(true));
  settings.quietHoursFor.mockResolvedValue(Result.ok(Option.none()));
  contexts.stillLost.mockResolvedValue(
    Result.ok(Option.some({ email: "parent@example.com", childLabel: "Jade" })),
  );
  subscriptions.listForUser.mockResolvedValue(Result.ok([PHONE]));
  subscriptions.lockScreenDetailsFor.mockResolvedValue(Result.ok(Option.none()));
  push.send.mockResolvedValue(Result.ok());
  email.sendAccessLoss.mockResolvedValue(Result.ok());

  service = new AccessLossAlertService(
    losses,
    settings,
    contexts,
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

describe("planning the warning when a child's Classroom access is lost", () => {
  it("given an access lost in the afternoon, then one warning is planned right away", async () => {
    await service.warn(CHILD, AFTERNOON);

    expect(losses.open).toHaveBeenCalledWith(CHILD, AFTERNOON);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ACCESS_LOSS_ALERT_SCHEDULED,
        aggregateId: WARNING,
        payload: {
          ...CHILD,
          accessAlertId: WARNING,
          dueAt: AFTERNOON.toISOString(),
          actorUserId: null,
        },
      },
    ]);
  });

  it("given an access lost during the quiet hours, then the warning waits for their end", async () => {
    await service.warn(CHILD, paris("2026-11-19", "23:30"));

    expect(losses.open).toHaveBeenCalledWith(CHILD, paris("2026-11-20", "07:00"));
  });

  it("given the warning of this loss is still open, when another sync fails, then nothing more is planned", async () => {
    losses.open.mockResolvedValue(Result.ok(Option.none()));

    await service.warn(CHILD, AFTERNOON);

    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given the child is reconnected, then its warning is closed so the next loss warns again", async () => {
    losses.close.mockResolvedValue(Result.ok([{ accessAlertId: WARNING, cancelled: false }]));

    await service.rearm(CHILD, AFTERNOON);

    expect(losses.close).toHaveBeenCalledWith(CHILD, AFTERNOON);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ACCESS_LOSS_ALERT_CLOSED,
      payload: { ...CHILD, accessAlertId: WARNING, cancelled: false, actorUserId: null },
    });
  });
});

describe("sending the warning", () => {
  it("given a parent who shows details on the lock screen, then one push names the child and opens the children page", async () => {
    givenDue();
    subscriptions.lockScreenDetailsFor.mockResolvedValue(Result.ok(Option.some(true)));

    const outcome = await service.runOnce(AFTERNOON);

    expect(outcome.getValue()).toMatchObject({ claimed: 1, sent: 1, emailed: 0 });
    expect(pushed()).toEqual([
      {
        title: "Accès Google perdu",
        body: "Reconnectez le compte de Jade pour continuer à recevoir ses échéances.",
        url: "https://app.example.com/children",
        tag: `access-${JADE}`,
      },
    ]);
    expect(email.sendAccessLoss).not.toHaveBeenCalled();
    expect(losses.settle).toHaveBeenCalledWith(claimed().lease, {
      status: "sent",
      channel: "push",
      at: AFTERNOON,
    });
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ACCESS_LOSS_ALERT_SENT,
      payload: { channel: "push", actorUserId: null },
    });
  });

  it("given the lock screen hides details by default, then the push does not name the child", async () => {
    givenDue();

    await service.runOnce(AFTERNOON);

    expect(pushed()[0]?.body).not.toContain("Jade");
    expect(pushed()[0]?.title).not.toContain("Google");
  });

  it("given no active push subscription, then the warning falls back to an email", async () => {
    givenDue();
    subscriptions.listForUser.mockResolvedValue(Result.ok([]));

    const outcome = await service.runOnce(AFTERNOON);

    expect(outcome.getValue()).toMatchObject({ sent: 0, emailed: 1 });
    expect(email.sendAccessLoss).toHaveBeenCalledWith("parent@example.com", {
      accessAlertId: WARNING,
      childLabel: "Jade",
      childrenUrl: "https://app.example.com/children",
    });
    expect(losses.settle).toHaveBeenCalledWith(claimed().lease, {
      status: "sent",
      channel: "email",
      at: AFTERNOON,
    });
  });

  it("given the child was reconnected before the warning left, then nothing is sent and the warning is closed", async () => {
    givenDue();
    contexts.stillLost.mockResolvedValue(Result.ok(Option.none()));

    await service.runOnce(AFTERNOON);

    expect(push.send).not.toHaveBeenCalled();
    expect(email.sendAccessLoss).not.toHaveBeenCalled();
    expect(losses.settle).toHaveBeenCalledWith(claimed().lease, {
      status: "cancelled",
      at: AFTERNOON,
    });
    expect(eventTypes()).toEqual([EventTypes.ACCESS_LOSS_ALERT_CLOSED]);
  });

  it("given the email keeps failing, then it is retried and given up on its last attempt", async () => {
    subscriptions.listForUser.mockResolvedValue(Result.ok([]));
    email.sendAccessLoss.mockResolvedValue(Result.fail(providerDown));

    givenDue({ failures: 0 });
    await service.runOnce(AFTERNOON);
    expect(losses.addFailure).toHaveBeenCalledTimes(1);

    givenDue({ failures: MAX_EMAIL_FAILURES - 1 });
    await service.runOnce(AFTERNOON);
    expect(losses.settle).toHaveBeenLastCalledWith(claimed().lease, { status: "missed" });
    expect(eventTypes().at(-1)).toBe(EventTypes.ACCESS_LOSS_ALERT_MISSED);
  });
});

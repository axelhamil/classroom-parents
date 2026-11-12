import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IPushSubscriptionRepository } from "../application/ports/push-subscription-repository.port";
import { PushSubscriptionService } from "../application/services/push-subscription.service";
import { PARENT } from "../testing/alert.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");
const SUBSCRIPTION_ID = "0196a000-0000-7000-8000-0000000000b1";

const browserSubscription = {
  endpoint: "https://web.push.apple.com/QGuQyavXutnMH",
  keys: {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
  userAgent: "Mozilla/5.0 (iPhone)",
};

let subscriptions: PortMock<IPushSubscriptionRepository>;
let outbox: PortMock<IOutboxRepository>;
let service: PushSubscriptionService;

beforeEach(() => {
  subscriptions = mockPort<IPushSubscriptionRepository>();
  outbox = mockPort<IOutboxRepository>();
  subscriptions.upsert.mockResolvedValue(
    Result.ok({ id: SUBSCRIPTION_ID, previousUserId: Option.none<string>() }),
  );
  subscriptions.deleteOwned.mockResolvedValue(Result.ok(Option.none()));
  subscriptions.countForUser.mockResolvedValue(Result.ok(2));

  service = new PushSubscriptionService(
    subscriptions,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("subscribe", () => {
  it("given a browser subscription, then it is stored for the parent and PUSH_SUBSCRIBED is emitted", async () => {
    const result = await service.subscribe(PARENT, browserSubscription);

    expect(result.isSuccess).toBe(true);
    expect(subscriptions.upsert.mock.calls[0]?.[0]).toMatchObject({
      userId: PARENT,
      endpoint: browserSubscription.endpoint,
      p256dh: browserSubscription.keys.p256dh,
      auth: browserSubscription.keys.auth,
      now: NOW,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.PUSH_SUBSCRIBED,
        aggregateId: SUBSCRIPTION_ID,
        payload: { userId: PARENT, subscriptionId: SUBSCRIPTION_ID },
      },
    ]);
  });

  it("given a subscription posted from a signed in device, then it is tied to that device's session", async () => {
    await service.subscribe(PARENT, { ...browserSubscription, sessionId: "session-phone" });

    expect(subscriptions.upsert.mock.calls[0]?.[0]?.sessionId).toEqual(
      Option.some("session-phone"),
    );
  });

  it("given a phone another parent subscribed, then the endpoint moves to this parent and the other parent's audit trail records it left them", async () => {
    subscriptions.upsert.mockResolvedValue(
      Result.ok({ id: SUBSCRIPTION_ID, previousUserId: Option.some("other-parent") }),
    );

    const result = await service.subscribe(PARENT, browserSubscription);

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.PUSH_UNSUBSCRIBED,
        aggregateId: SUBSCRIPTION_ID,
        payload: { userId: "other-parent", subscriptionId: SUBSCRIPTION_ID, actorUserId: PARENT },
      },
      {
        eventType: EventTypes.PUSH_SUBSCRIBED,
        aggregateId: SUBSCRIPTION_ID,
        payload: { userId: PARENT, subscriptionId: SUBSCRIPTION_ID },
      },
    ]);
  });

  it("given the parent re-subscribes their own phone, then no unsubscription is recorded", async () => {
    subscriptions.upsert.mockResolvedValue(
      Result.ok({ id: SUBSCRIPTION_ID, previousUserId: Option.some(PARENT) }),
    );

    await service.subscribe(PARENT, browserSubscription);

    expect(enqueuedEvents(outbox).map((event) => event.eventType)).toEqual([
      EventTypes.PUSH_SUBSCRIBED,
    ]);
  });

  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGuQyavXutnMH",
    "https://api.push.apple.com/3/device/abc",
  ])("given the known push service %s, then the subscription is stored", async (endpoint) => {
    const result = await service.subscribe(PARENT, { ...browserSubscription, endpoint });

    expect(result.isSuccess).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://push.example.com/x",
    "https://169.254.169.254/latest/meta-data",
    "https://127.0.0.1:5432/x",
    "https://localhost/x",
    "https://[::1]/x",
    "https://api.railway.internal/admin",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://user:pass@fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilpush.apple.com.example/x",
    "https://notify.windows.com/x",
  ])(
    "given the endpoint %s outside the known push services, then PUSH_SUBSCRIPTION_INVALID and nothing is stored",
    async (endpoint) => {
      const result = await service.subscribe(PARENT, { ...browserSubscription, endpoint });

      expect(result.getError().code).toBe("PUSH_SUBSCRIPTION_INVALID");
      expect(subscriptions.upsert).not.toHaveBeenCalled();
    },
  );
});

describe("unsubscribe and status", () => {
  it("given another family's endpoint, then the delete is scoped to the caller, still answers success and emits nothing", async () => {
    const result = await service.unsubscribe(PARENT, "https://push.example.com/other-family");

    expect(result.isSuccess).toBe(true);
    expect(subscriptions.deleteOwned).toHaveBeenCalledWith(
      PARENT,
      "https://push.example.com/other-family",
    );
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given the parent's own subscription, then it is deleted and PUSH_UNSUBSCRIBED names the parent", async () => {
    subscriptions.deleteOwned.mockResolvedValue(Result.ok(Option.some(SUBSCRIPTION_ID)));

    await service.unsubscribe(PARENT, browserSubscription.endpoint);

    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.PUSH_UNSUBSCRIBED,
        aggregateId: SUBSCRIPTION_ID,
        payload: { userId: PARENT, subscriptionId: SUBSCRIPTION_ID, actorUserId: PARENT },
      },
    ]);
  });

  it("given two live subscriptions, then status counts them", async () => {
    const result = await service.status(PARENT);

    expect(result.getValue()).toEqual({ live: 2 });
  });
});

describe("forget a revoked session", () => {
  it("given the parent signed a device out, then only that device's subscriptions go and each removal names the parent", async () => {
    subscriptions.deleteForSession.mockResolvedValue(Result.ok([SUBSCRIPTION_ID]));

    const result = await service.forgetSession(PARENT, "session-phone");

    expect(result.isSuccess).toBe(true);
    expect(subscriptions.deleteForSession).toHaveBeenCalledWith(PARENT, "session-phone");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.PUSH_UNSUBSCRIBED,
        aggregateId: SUBSCRIPTION_ID,
        payload: { userId: PARENT, subscriptionId: SUBSCRIPTION_ID, actorUserId: PARENT },
      },
    ]);
  });

  it("given the device never allowed alerts, then nothing is removed and nothing is announced", async () => {
    subscriptions.deleteForSession.mockResolvedValue(Result.ok([]));

    const result = await service.forgetSession(PARENT, "session-laptop");

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

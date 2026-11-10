import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
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
  subscriptions.upsert.mockResolvedValue(Result.ok(SUBSCRIPTION_ID));
  subscriptions.deleteOwned.mockResolvedValue(Result.ok());
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

  it("given an endpoint that is not https, then PUSH_SUBSCRIPTION_INVALID and nothing is stored", async () => {
    const result = await service.subscribe(PARENT, {
      ...browserSubscription,
      endpoint: "http://push.example.com/x",
    });

    expect(result.getError().code).toBe("PUSH_SUBSCRIPTION_INVALID");
    expect(subscriptions.upsert).not.toHaveBeenCalled();
  });
});

describe("unsubscribe and status", () => {
  it("given another family's endpoint, then the delete is scoped to the caller and still answers success", async () => {
    const result = await service.unsubscribe(PARENT, "https://push.example.com/other-family");

    expect(result.isSuccess).toBe(true);
    expect(subscriptions.deleteOwned).toHaveBeenCalledWith(
      PARENT,
      "https://push.example.com/other-family",
    );
  });

  it("given two live subscriptions, then status counts them", async () => {
    const result = await service.status(PARENT);

    expect(result.getValue()).toEqual({ live: 2 });
  });
});

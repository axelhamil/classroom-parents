import { describe, expect, test } from "bun:test";
import type { PgListener } from "@packages/outbox/pg-listener";
import { FakePgListenClient } from "@packages/outbox/testing/fake-pg-listen-client";
import { logger } from "../logger";
import { NoOpInstrumentation } from "../services/noop-instrumentation";
import {
  MAX_STREAMS_PER_USER,
  NotificationStreamHub,
  userStreamNotification,
} from "../services/notification-stream-hub";

const EVENTS_CHANGED = { type: "events.changed" } as const;

const makeHub = () =>
  new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());

describe("NotificationStreamHub", () => {
  test("dispatches a message to its recipient only", () => {
    const hub = makeHub();
    const received: string[] = [];

    hub.subscribe("u1", (message) => received.push(`u1 ${message.type}`));
    hub.subscribe("u2", (message) => received.push(`u2 ${message.type}`));

    hub.dispatch(userStreamNotification("u1", EVENTS_CHANGED));

    expect(received).toEqual(["u1 events.changed"]);
  });

  test("drops a notification whose payload is not a stream message", () => {
    const hub = makeHub();
    const received: string[] = [];
    hub.subscribe("u1", (message) => received.push(message.type));

    hub.dispatch("u1");
    hub.dispatch(JSON.stringify({ userId: "u1", message: { type: "unknown" } }));
    hub.dispatch(undefined);

    expect(received).toEqual([]);
  });

  test("unsubscribing releases the handle", () => {
    const hub = makeHub();
    const unsubscribe = hub.subscribe("u1", () => {});

    expect(hub.subscriberCount("u1")).toBe(1);
    unsubscribe();
    expect(hub.subscriberCount("u1")).toBe(0);
  });

  test("every tab of the same user receives the signal", () => {
    const hub = makeHub();
    let calls = 0;

    hub.subscribe("u1", () => calls++);
    hub.subscribe("u1", () => calls++);
    hub.dispatch(userStreamNotification("u1", EVENTS_CHANGED));

    expect(calls).toBe(2);
  });

  test("a signal for a user without subscribers leaves the others untouched", () => {
    const hub = makeHub();
    let calls = 0;
    hub.subscribe("u1", () => calls++);

    hub.dispatch(userStreamNotification("unknown", EVENTS_CHANGED));

    expect(calls).toBe(0);
    expect(hub.subscriberCount("u1")).toBe(1);
  });

  test("a throwing handle does not stop the others from receiving", () => {
    const hub = makeHub();
    const received: string[] = [];
    hub.subscribe("u1", () => {
      throw new Error("dead tab");
    });
    hub.subscribe("u1", () => received.push("second"));

    hub.dispatch(userStreamNotification("u1", EVENTS_CHANGED));

    expect(received).toEqual(["second"]);
  });

  test("the counter reaches the cap after MAX_STREAMS_PER_USER subscriptions", () => {
    const hub = makeHub();

    for (let i = 0; i < MAX_STREAMS_PER_USER; i++) {
      expect(hub.subscriberCount("u1") >= MAX_STREAMS_PER_USER).toBe(false);
      hub.subscribe("u1", () => {});
    }

    expect(hub.subscriberCount("u1") >= MAX_STREAMS_PER_USER).toBe(true);
  });

  test("a NOTIFY on the listen connection reaches the user named in its payload", async () => {
    const client = new FakePgListenClient();
    const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation(), {
      createClient: () => client,
    });
    const listener = (hub as unknown as { listener: PgListener }).listener;
    const received: string[] = [];
    hub.subscribe("u1", () => received.push("u1"));
    hub.subscribe("u2", () => received.push("u2"));

    await listener.start();
    client.deliver(userStreamNotification("u1", { type: "sync.finished", childId: "c1" }));

    expect(received).toEqual(["u1"]);

    await hub.stop();
  });
});

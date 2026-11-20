import { describe, expect, it } from "bun:test";
import type { UserStreamMessage } from "@packages/events/user-stream-message";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { userStreamRelay } from "../services/user-stream-relay";

function delivered(eventType: string, payload: unknown): DeliveredEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    aggregateId: "aggregate",
    aggregateType: "test",
    dateOccurred: new Date(),
    payload,
  };
}

function relayWithSink() {
  const published: { userId: string; message: UserStreamMessage }[] = [];
  const relay = userStreamRelay({
    publish: async (userId, message) => {
      published.push({ userId, message });
    },
  });

  return { relay, published };
}

describe("user stream relay", () => {
  it("tells the parent their agenda changed on every event lifecycle", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("agenda.event.created", {
        userId: "parent",
        eventId: "e1",
        childId: "c1",
        needsReview: false,
        actorUserId: null,
      }),
    );
    await relay.handle(
      delivered("agenda.event.updated", { userId: "parent", eventId: "e1", fields: ["done"] }),
    );
    await relay.handle(delivered("agenda.event.deleted", { userId: "parent", eventId: "e1" }));
    await relay.handle(
      delivered("agenda.events_purged", {
        userId: "parent",
        count: 3,
        reason: "retention",
        scope: "past",
        actorUserId: null,
      }),
    );

    expect(published).toEqual([
      { userId: "parent", message: { type: "events.changed" } },
      { userId: "parent", message: { type: "events.changed" } },
      { userId: "parent", message: { type: "events.changed" } },
      { userId: "parent", message: { type: "events.changed" } },
    ]);
  });

  it("tells the parent their children changed on a connection lifecycle", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("child.account.reconnect_needed", {
        userId: "parent",
        childId: "c1",
        cause: "invalid_grant",
        actorUserId: null,
      }),
    );

    expect(published).toEqual([{ userId: "parent", message: { type: "children.changed" } }]);
  });

  it("tells the parent their children changed when a child takes another color", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("child.account.color_changed", {
        userId: "parent",
        actorUserId: "parent",
        childId: "c1",
        color: 3,
      }),
    );

    expect(published).toEqual([{ userId: "parent", message: { type: "children.changed" } }]);
  });

  it("tells the parent their children changed when a child shows its photo or its initial", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("child.account.photo_choice_changed", {
        userId: "parent",
        actorUserId: "parent",
        childId: "c1",
        showsPhoto: true,
      }),
    );

    expect(published).toEqual([{ userId: "parent", message: { type: "children.changed" } }]);
  });

  it("names the synced child and refreshes the agenda when a sync finishes", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("classroom.announcements.synced", {
        userId: "parent",
        childId: "c1",
        newAnnouncements: 2,
        eventsCreated: 1,
        actorUserId: null,
      }),
    );

    expect(published).toEqual([
      { userId: "parent", message: { type: "sync.finished", childId: "c1" } },
      { userId: "parent", message: { type: "events.changed" } },
    ]);
  });

  it("names the new notification so the bell refreshes and announces it", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("notification.notification.created", {
        userId: "parent",
        notificationId: "n1",
        kind: "new_deadlines",
        grouped: false,
        actorUserId: null,
      }),
    );

    expect(published).toEqual([
      { userId: "parent", message: { type: "notification.created", notificationId: "n1" } },
    ]);
  });

  it("tells every open screen of the parent that notifications were read", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(
      delivered("notification.notification.read", { userId: "parent", notificationId: "n1" }),
    );
    await relay.handle(
      delivered("notification.notifications.read_all", { userId: "parent", count: 3 }),
    );

    expect(published).toEqual([
      { userId: "parent", message: { type: "notifications.read" } },
      { userId: "parent", message: { type: "notifications.read" } },
    ]);
  });

  it("stays silent on events the screens do not show", async () => {
    const { relay, published } = relayWithSink();

    await relay.handle(delivered("user.signed_in", { userId: "parent", sessionId: "s" }));

    expect(published).toEqual([]);
  });
});

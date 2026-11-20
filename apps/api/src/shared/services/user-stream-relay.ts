import type { IInstrumentation } from "@packages/ddd-kit";
import { db, sql } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import type { UserStreamMessage } from "@packages/events/user-stream-message";
import type { BuiltInEventHandler } from "@packages/outbox/event-handlers";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { z } from "zod";
import { USER_STREAM_CHANNEL, userStreamNotification } from "./notification-stream-hub";

export interface IUserStreamPublisher {
  publish(userId: string, message: UserStreamMessage): Promise<void>;
}

const AGENDA_TYPES: ReadonlySet<string> = new Set([
  EventTypes.EVENT_CREATED,
  EventTypes.EVENT_ADDED,
  EventTypes.EVENT_UPDATED,
  EventTypes.EVENT_DELETED,
  EventTypes.EVENT_SUPERSEDED,
  EventTypes.EVENT_FLAGGED,
  EventTypes.EVENTS_PURGED,
]);

const CHILDREN_TYPES: ReadonlySet<string> = new Set([
  EventTypes.CHILD_CONNECTED,
  EventTypes.CHILD_RENAMED,
  EventTypes.CHILD_COLOR_CHANGED,
  EventTypes.CHILD_PHOTO_CHOICE_CHANGED,
  EventTypes.CHILD_DISCONNECT_REQUESTED,
  EventTypes.CHILD_DISCONNECTED,
  EventTypes.CHILD_NEEDS_RECONNECT,
]);

const NOTIFICATIONS_READ_TYPES: ReadonlySet<string> = new Set([
  EventTypes.NOTIFICATION_READ,
  EventTypes.NOTIFICATIONS_READ_ALL,
]);

const StreamRecipient = z.object({
  userId: z.string(),
  childId: z.string().optional(),
  notificationId: z.string().optional(),
});

type Recipient = z.infer<typeof StreamRecipient>;

function notificationMessagesFor(
  event: DeliveredEvent,
  { notificationId }: Recipient,
): UserStreamMessage[] {
  if (NOTIFICATIONS_READ_TYPES.has(event.eventType)) return [{ type: "notifications.read" }];
  if (event.eventType !== EventTypes.NOTIFICATION_CREATED || notificationId === undefined)
    return [];

  return [{ type: "notification.created", notificationId }];
}

function streamMessagesFor(event: DeliveredEvent, recipient: Recipient): UserStreamMessage[] {
  const { childId } = recipient;
  if (AGENDA_TYPES.has(event.eventType)) return [{ type: "events.changed" }];
  if (CHILDREN_TYPES.has(event.eventType)) return [{ type: "children.changed" }];
  if (event.eventType !== EventTypes.ANNOUNCEMENT_SYNCED || childId === undefined)
    return notificationMessagesFor(event, recipient);

  return [{ type: "sync.finished", childId }, { type: "events.changed" }];
}

export function userStreamRelay(publisher: IUserStreamPublisher): BuiltInEventHandler {
  return {
    name: "user-stream-relay",
    handle: async (event) => {
      const recipient = StreamRecipient.safeParse(event.payload);
      if (!recipient.success) return;

      for (const message of streamMessagesFor(event, recipient.data))
        await publisher.publish(recipient.data.userId, message);
    },
  };
}

export class PgUserStreamPublisher implements IUserStreamPublisher {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async publish(userId: string, message: UserStreamMessage): Promise<void> {
    const query = sql`select pg_notify(${USER_STREAM_CHANNEL}, ${userStreamNotification(userId, message)})`;

    await this.instrumentation.startSpan({ name: "PgUserStreamPublisher > publish" }, async () => {
      try {
        await this.instrumentation.startSpan({ name: "select pg_notify", op: "db.query" }, () =>
          db.execute(query),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        throw err;
      }
    });
  }
}

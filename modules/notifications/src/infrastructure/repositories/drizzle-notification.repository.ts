import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  arrayContains,
  count,
  dbOperationFailure,
  desc,
  eq,
  excluded,
  isNull,
  not,
  type RepositoryTracer,
  repositoryTracer,
  resolveExecutor,
  sql,
} from "@packages/drizzle";
import { afterTimeIdCursor, encodeTimeIdCursor, exactInstant } from "@packages/http/time-id-cursor";
import { notification } from "../../../schemas/notification.schema";
import type {
  FeedCursor,
  FeedPage,
  INotificationRepository,
  NotificationDraft,
  NotificationsError,
  PostedNotification,
  ReadMark,
  StoredNotification,
} from "../../application/ports/notification-repository.port";
import {
  type NotificationContent,
  notificationContentSchema,
} from "../../domain/notification-content";

type Row = typeof notification.$inferSelect;

const FOREIGN_KEY_VIOLATION = "23503";

function storedShape(content: NotificationContent) {
  if (content.kind === "dates_to_check")
    return { kind: content.kind, params: {}, members: content.eventIds };

  const { kind, ...params } = content;
  return { kind, params, members: [] };
}

function contentOf(row: Row): Option<NotificationContent> {
  const members = row.kind === "dates_to_check" ? { eventIds: row.members } : {};
  const parsed = notificationContentSchema.safeParse({ ...row.params, ...members, kind: row.kind });

  return parsed.success ? Option.some(parsed.data) : Option.none();
}

function storedOf(row: Row): StoredNotification[] {
  return contentOf(row)
    .map((content) => [
      {
        id: row.id,
        childId: Option.fromNullable(row.childId),
        content,
        createdAt: row.createdAt,
        readAt: Option.fromNullable(row.readAt),
      },
    ])
    .unwrapOr([]);
}

function childWentAway(err: unknown): boolean {
  const cause = err instanceof Error ? err.cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === FOREIGN_KEY_VIOLATION
  );
}

export class DrizzleNotificationRepository implements INotificationRepository {
  private readonly trace: RepositoryTracer<NotificationsError>;

  constructor(instrumentation: IInstrumentation) {
    this.trace = repositoryTracer(
      instrumentation,
      "DrizzleNotificationRepository",
      dbOperationFailure("NOTIFICATIONS_PROVIDER_FAILURE"),
    );
  }

  async post(
    draft: NotificationDraft,
  ): Promise<Result<Option<PostedNotification>, NotificationsError>> {
    const exec = resolveExecutor();
    return this.trace.method("post", async () => {
      const { kind, params, members } = storedShape(draft.content);
      const query = exec
        .insert(notification)
        .values({
          userId: draft.userId,
          ref: draft.ref,
          kind,
          childId: draft.childId.toNull(),
          params,
          members,
          createdAt: draft.at,
        })
        .onConflictDoUpdate({
          target: [notification.userId, notification.ref],
          set: {
            members: sql`array_cat(${notification.members}, ${excluded(notification.members)})`,
            readAt: null,
          },
          setWhere: not(arrayContains(notification.members, excluded(notification.members))),
        })
        .returning({ id: notification.id, inserted: sql<boolean>`(xmax = 0)` });
      try {
        const [written] = await this.trace.query(query);
        return Result.ok(
          Option.fromNullable(written).map(({ id, inserted }) => ({
            notificationId: id,
            grouped: !inserted,
          })),
        );
      } catch (err) {
        if (childWentAway(err)) return Result.ok(Option.none());
        throw err;
      }
    });
  }

  async page(
    userId: string,
    cursor: Option<FeedCursor>,
    limit: number,
  ): Promise<Result<FeedPage, NotificationsError>> {
    const exec = resolveExecutor();
    return this.trace.method("page", async () => {
      const after = cursor
        .map((at) => afterTimeIdCursor(notification.createdAt, notification.id, at))
        .toNull();
      const rows = await this.trace.query(
        exec
          .select({ row: notification, cursorAt: exactInstant(notification.createdAt) })
          .from(notification)
          .where(and(eq(notification.userId, userId), after ?? undefined))
          .orderBy(desc(notification.createdAt), desc(notification.id))
          .limit(limit + 1),
      );

      const shown = rows.slice(0, limit);
      const last = shown.at(-1);
      const nextCursor = Option.fromNullable(rows.length > limit ? last : undefined).map(
        ({ row, cursorAt }) => encodeTimeIdCursor(cursorAt, row.id),
      );
      return Result.ok({ notifications: shown.flatMap(({ row }) => storedOf(row)), nextCursor });
    });
  }

  async unreadCount(userId: string): Promise<Result<number, NotificationsError>> {
    const exec = resolveExecutor();
    return this.trace.method("unreadCount", async () => {
      const [counted] = await this.trace.query(
        exec
          .select({ total: count() })
          .from(notification)
          .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
      );

      return Result.ok(counted?.total ?? 0);
    });
  }

  async markRead(
    userId: string,
    notificationId: string,
    at: Date,
  ): Promise<Result<ReadMark, NotificationsError>> {
    const exec = resolveExecutor();
    return this.trace.method(
      "markRead",
      async (): Promise<Result<ReadMark, NotificationsError>> => {
        const owned = and(eq(notification.userId, userId), eq(notification.id, notificationId));
        const [read] = await this.trace.query(
          exec
            .update(notification)
            .set({ readAt: at })
            .where(and(owned, isNull(notification.readAt)))
            .returning({ id: notification.id }),
        );
        if (read) return Result.ok("read");

        const [kept] = await this.trace.query(
          exec.select({ id: notification.id }).from(notification).where(owned),
        );
        return Result.ok(kept ? "already_read" : "absent");
      },
    );
  }

  async markReadByRef(
    userId: string,
    ref: string,
    at: Date,
  ): Promise<Result<Option<string>, NotificationsError>> {
    const exec = resolveExecutor();
    return this.trace.method("markReadByRef", async () => {
      const [read] = await this.trace.query(
        exec
          .update(notification)
          .set({ readAt: at })
          .where(
            and(
              eq(notification.userId, userId),
              eq(notification.ref, ref),
              isNull(notification.readAt),
            ),
          )
          .returning({ id: notification.id }),
      );

      return Result.ok(Option.fromNullable(read?.id));
    });
  }

  async markAllRead(userId: string, at: Date): Promise<Result<number, NotificationsError>> {
    const exec = resolveExecutor();
    return this.trace.method("markAllRead", async () => {
      const read = await this.trace.query(
        exec
          .update(notification)
          .set({ readAt: at })
          .where(and(eq(notification.userId, userId), isNull(notification.readAt)))
          .returning({ id: notification.id }),
      );

      return Result.ok(read.length);
    });
  }
}

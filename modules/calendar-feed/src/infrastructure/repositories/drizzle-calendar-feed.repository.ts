import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { dbOperationFailure, eq, resolveExecutor, type SQL } from "@packages/drizzle";
import { calendarFeed } from "../../../schemas/calendar-feed.schema";
import type {
  CalendarFeedError,
  ICalendarFeedRepository,
} from "../../application/ports/calendar-feed-repository.port";
import { CalendarFeed } from "../../domain/calendar-feed.aggregate";
import { CalendarFeedId } from "../../domain/calendar-feed-id";
import { FeedScope } from "../../domain/value-objects/feed-scope.vo";
import { FeedSecretHash } from "../../domain/value-objects/feed-secret-hash.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("CALENDAR_FEED_PROVIDER_FAILURE");

type FeedRow = typeof calendarFeed.$inferSelect;

function toDomain(row: FeedRow): Result<CalendarFeed, string> {
  const id = CalendarFeedId.parse(row.id);
  const secretHash = FeedSecretHash.create(row.secretHash);
  const scope = FeedScope.fromChildIds(Option.fromNullable(row.childIds));
  if (id.isFailure) return Result.fail(id.getError());
  if (secretHash.isFailure) return Result.fail(secretHash.getError());
  if (scope.isFailure) return Result.fail(scope.getError());

  return Result.ok(
    CalendarFeed.reconstitute(
      {
        userId: row.userId,
        secretHash: secretHash.getValue(),
        scope: scope.getValue(),
        createdAt: row.createdAt,
        rotatedAt: Option.fromNullable(row.rotatedAt),
        lastFetchedAt: Option.fromNullable(row.lastFetchedAt),
      },
      id.getValue(),
    ),
  );
}

function toRow(feed: CalendarFeed) {
  return {
    id: feed.id.value,
    userId: feed.get("userId"),
    secretHash: feed.get("secretHash").value,
    childIds: feed.get("scope").childIds().toNull(),
    createdAt: feed.get("createdAt"),
    rotatedAt: feed.get("rotatedAt").toNull(),
    lastFetchedAt: feed.get("lastFetchedAt").toNull(),
  };
}

export class DrizzleCalendarFeedRepository implements ICalendarFeedRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async lockOwned(userId: string): Promise<Result<Option<CalendarFeed>, CalendarFeedError>> {
    return this.findOne("lockOwned", eq(calendarFeed.userId, userId), true);
  }

  async findOwned(userId: string): Promise<Result<Option<CalendarFeed>, CalendarFeedError>> {
    return this.findOne("findOwned", eq(calendarFeed.userId, userId), false);
  }

  async findBySecretHash(
    secretHash: FeedSecretHash,
  ): Promise<Result<Option<CalendarFeed>, CalendarFeedError>> {
    return this.findOne("findBySecretHash", eq(calendarFeed.secretHash, secretHash.value), false);
  }

  async insertIfAbsent(feed: CalendarFeed): Promise<Result<boolean, CalendarFeedError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleCalendarFeedRepository > insertIfAbsent" },
      async () => {
        try {
          const query = exec
            .insert(calendarFeed)
            .values(toRow(feed))
            .onConflictDoNothing({ target: calendarFeed.userId })
            .returning({ id: calendarFeed.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("insertIfAbsent", err));
        }
      },
    );
  }

  async save(feed: CalendarFeed): Promise<Result<void, CalendarFeedError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleCalendarFeedRepository > save" },
      async () => {
        try {
          const { id, userId: _userId, createdAt: _createdAt, ...mutable } = toRow(feed);
          const query = exec.update(calendarFeed).set(mutable).where(eq(calendarFeed.id, id));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("save", err));
        }
      },
    );
  }

  async recordFetch(feed: CalendarFeed): Promise<Result<void, CalendarFeedError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleCalendarFeedRepository > recordFetch" },
      async () => {
        try {
          const query = exec
            .update(calendarFeed)
            .set({ lastFetchedAt: feed.get("lastFetchedAt").toNull() })
            .where(eq(calendarFeed.id, feed.id.value));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("recordFetch", err));
        }
      },
    );
  }

  async deleteOwned(userId: string): Promise<Result<Option<string>, CalendarFeedError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleCalendarFeedRepository > deleteOwned" },
      async () => {
        try {
          const query = exec
            .delete(calendarFeed)
            .where(eq(calendarFeed.userId, userId))
            .returning({ id: calendarFeed.id });
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row?.id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("deleteOwned", err));
        }
      },
    );
  }

  private async findOne(
    method: string,
    where: SQL,
    forUpdate: boolean,
  ): Promise<Result<Option<CalendarFeed>, CalendarFeedError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleCalendarFeedRepository > ${method}` },
      async () => {
        try {
          const select = exec.select().from(calendarFeed).where(where);
          const query = forUpdate ? select.for("update") : select;
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) return Result.ok(Option.none());

          const mapped = toDomain(row);
          if (mapped.isFailure) {
            const corrupt = new Error(`calendar feed ${row.id}: ${mapped.getError()}`);
            this.instrumentation.capture(corrupt);
            return Result.fail(repositoryFailure(method, corrupt));
          }

          return Result.ok(Option.some(mapped.getValue()));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }
}

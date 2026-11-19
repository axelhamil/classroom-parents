import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, resolveExecutor, sql } from "@packages/drizzle";
import { homeLayout, homeNote } from "../../../schemas/home.schema";
import type { HomeError } from "../../application/errors/home-errors";
import type {
  IHomeRepository,
  StoredHomeLayout,
  StoredHomeNote,
} from "../../application/ports/home-repository.port";
import type { HomeLayout } from "../../domain/value-objects/home-layout.vo";
import { HomeNote } from "../../domain/value-objects/home-note.vo";
import { homeLayoutMapper } from "./home-layout.mapper";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("HOME_PROVIDER_FAILURE");

const FIRST_REVISION_BASE = 0;

const NO_LAYOUT: StoredHomeLayout = { layout: Option.none(), revision: FIRST_REVISION_BASE };

interface Query<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

type Outcome<T> = Promise<Result<T, HomeError>>;

function nextRevisionOf(blocks: unknown, at: Date) {
  return { blocks, updatedAt: at, revision: sql`${homeLayout.revision} + 1` };
}

export class DrizzleHomeRepository implements IHomeRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async layoutOf(userId: string): Outcome<StoredHomeLayout> {
    const exec = resolveExecutor();
    return this.guarded("layoutOf", async () => {
      const [row] = await this.run(
        exec
          .select({ blocks: homeLayout.blocks, revision: homeLayout.revision })
          .from(homeLayout)
          .where(eq(homeLayout.userId, userId))
          .limit(1),
      );
      if (!row) return Result.ok(NO_LAYOUT);

      const layout = homeLayoutMapper.toDomain(row.blocks);
      if (layout.isFailure) return this.corrupt("layoutOf", layout.getError());

      return Result.ok({ layout: layout.getValue(), revision: row.revision });
    });
  }

  async writeLayout(
    userId: string,
    layout: Option<HomeLayout>,
    baseRevision: number,
    at: Date,
  ): Outcome<Option<number>> {
    return this.guarded("writeLayout", async () => {
      const blocks = homeLayoutMapper.toPersistence(layout);
      const [row] =
        baseRevision === FIRST_REVISION_BASE
          ? await this.run(this.firstLayoutWrite(userId, blocks, at))
          : await this.run(this.nextLayoutWrite(userId, blocks, baseRevision, at));

      return Result.ok(Option.fromNullable(row?.revision));
    });
  }

  async noteOf(userId: string): Outcome<Option<StoredHomeNote>> {
    const exec = resolveExecutor();
    return this.guarded("noteOf", async () => {
      const [row] = await this.run(
        exec
          .select({ body: homeNote.body, updatedAt: homeNote.updatedAt })
          .from(homeNote)
          .where(eq(homeNote.userId, userId))
          .limit(1),
      );
      if (!row) return Result.ok(Option.none());

      const note = HomeNote.create(row.body).map((restored) => ({
        note: restored,
        updatedAt: row.updatedAt,
      }));
      return this.restored("noteOf", note);
    });
  }

  async saveNote(userId: string, note: HomeNote, at: Date): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("saveNote", async () => {
      const values = { body: note.value, updatedAt: at };
      await this.run(
        exec
          .insert(homeNote)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: homeNote.userId, set: values }),
      );
      return Result.ok();
    });
  }

  async clearNote(userId: string): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("clearNote", async () => {
      await this.run(exec.delete(homeNote).where(eq(homeNote.userId, userId)));
      return Result.ok();
    });
  }

  private firstLayoutWrite(userId: string, blocks: unknown, at: Date) {
    return resolveExecutor()
      .insert(homeLayout)
      .values({ userId, blocks, updatedAt: at, revision: FIRST_REVISION_BASE + 1 })
      .onConflictDoUpdate({
        target: homeLayout.userId,
        set: nextRevisionOf(blocks, at),
        setWhere: eq(homeLayout.revision, FIRST_REVISION_BASE),
      })
      .returning({ revision: homeLayout.revision });
  }

  private nextLayoutWrite(userId: string, blocks: unknown, baseRevision: number, at: Date) {
    return resolveExecutor()
      .update(homeLayout)
      .set(nextRevisionOf(blocks, at))
      .where(and(eq(homeLayout.userId, userId), eq(homeLayout.revision, baseRevision)))
      .returning({ revision: homeLayout.revision });
  }

  private restored<T>(method: string, value: Result<T, string>): Outcome<Option<T>> {
    if (value.isSuccess) return Promise.resolve(Result.ok(Option.some(value.getValue())));

    return this.corrupt(method, value.getError());
  }

  private corrupt<T>(method: string, reason: string): Outcome<T> {
    const corrupt = new Error(`stored home row is invalid: ${reason}`);
    this.instrumentation.capture(corrupt);
    return Promise.resolve(Result.fail(repositoryFailure(method, corrupt)));
  }

  private run<T>(query: Query<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
      () => query.execute(),
    );
  }

  private guarded<T>(method: string, work: () => Outcome<T>): Outcome<T> {
    return this.instrumentation.startSpan(
      { name: `DrizzleHomeRepository > ${method}` },
      async () => {
        try {
          return await work();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }
}

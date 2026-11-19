import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import { homeLayout, homeNote } from "../../../schemas/home.schema";
import type { HomeError } from "../../application/errors/home-errors";
import type { IHomeRepository, StoredHomeNote } from "../../application/ports/home-repository.port";
import { HomeLayout, homeLayoutSchema } from "../../domain/value-objects/home-layout.vo";
import { HomeNote } from "../../domain/value-objects/home-note.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("HOME_PROVIDER_FAILURE");

interface Query<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

type Outcome<T> = Promise<Result<T, HomeError>>;

export class DrizzleHomeRepository implements IHomeRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async layoutOf(userId: string): Outcome<Option<HomeLayout>> {
    const exec = resolveExecutor();
    return this.guarded("layoutOf", async () => {
      const [row] = await this.run(
        exec
          .select({ blocks: homeLayout.blocks })
          .from(homeLayout)
          .where(eq(homeLayout.userId, userId))
          .limit(1),
      );
      if (!row) return Result.ok(Option.none());

      const blocks = homeLayoutSchema.safeParse(row.blocks);
      const layout = blocks.success
        ? HomeLayout.create(blocks.data)
        : Result.fail<HomeLayout>(blocks.error.message);
      return this.restored("layoutOf", layout);
    });
  }

  async saveLayout(userId: string, layout: HomeLayout, at: Date): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("saveLayout", async () => {
      const values = { blocks: [...layout.value], updatedAt: at };
      await this.run(
        exec
          .insert(homeLayout)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: homeLayout.userId, set: values }),
      );
      return Result.ok();
    });
  }

  async clearLayout(userId: string): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("clearLayout", async () => {
      await this.run(exec.delete(homeLayout).where(eq(homeLayout.userId, userId)));
      return Result.ok();
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

  private restored<T>(method: string, value: Result<T, string>): Outcome<Option<T>> {
    if (value.isSuccess) return Promise.resolve(Result.ok(Option.some(value.getValue())));

    const corrupt = new Error(`stored home row is invalid: ${value.getError()}`);
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

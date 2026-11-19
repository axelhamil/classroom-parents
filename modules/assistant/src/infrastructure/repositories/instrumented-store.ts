import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure } from "@packages/drizzle";
import type { AssistantError } from "../../application/errors/assistant-errors";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("ASSISTANT_PROVIDER_FAILURE");

interface Query<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

export abstract class InstrumentedStore {
  protected constructor(
    protected readonly instrumentation: IInstrumentation,
    private readonly storeName: string,
  ) {}

  protected run<T>(query: Query<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
      () => query.execute(),
    );
  }

  protected guarded<T>(
    method: string,
    work: () => Promise<Result<T, AssistantError>>,
  ): Promise<Result<T, AssistantError>> {
    return this.instrumentation.startSpan({ name: `${this.storeName} > ${method}` }, async () => {
      try {
        return await work();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(storeFailure(method, err));
      }
    });
  }
}

import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure } from "@packages/drizzle";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";

const dbAttrs = { "db.system.name": "postgresql" } as const;

export const repositoryFailure = dbOperationFailure("SCHOOL_CALENDAR_PROVIDER_FAILURE");

export type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

interface Query<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

/** The span and capture every repository of the module wraps its methods and queries in. */
export abstract class InstrumentedRepository {
  constructor(
    protected readonly instrumentation: IInstrumentation,
    private readonly repositoryName: string,
  ) {}

  protected run<T>(query: Query<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
      () => query.execute(),
    );
  }

  protected guarded<T>(method: string, work: () => Outcome<T>): Outcome<T> {
    return this.instrumentation.startSpan(
      { name: `${this.repositoryName} > ${method}` },
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

  protected corrupt<T>(method: string, detail: string): Result<T, SchoolCalendarError> {
    const error = new Error(detail);
    this.instrumentation.capture(error);

    return Result.fail(repositoryFailure(method, error));
  }
}

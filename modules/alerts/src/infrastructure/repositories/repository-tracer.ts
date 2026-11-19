import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure } from "@packages/drizzle";
import type { AlertsError } from "../../application/ports/alert-repository.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

interface TracedQuery<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

export interface RepositoryTracer {
  query<T>(query: TracedQuery<T>): Promise<T>;
  method<T>(
    name: string,
    work: () => Promise<Result<T, AlertsError>>,
  ): Promise<Result<T, AlertsError>>;
}

export function repositoryTracer(
  instrumentation: IInstrumentation,
  repository: string,
): RepositoryTracer {
  return {
    query: (query) =>
      instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      ),
    method: (name, work) =>
      instrumentation.startSpan({ name: `${repository} > ${name}` }, async () => {
        try {
          return await work();
        } catch (err) {
          instrumentation.capture(err);
          return Result.fail(repositoryFailure(name, err));
        }
      }),
  };
}

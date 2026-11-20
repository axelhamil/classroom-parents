import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";

const dbAttrs = { "db.system.name": "postgresql" } as const;

interface TracedQuery<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

/**
 * The spans and the failure mapping every repository method shares (root rule 8): `method`
 * opens the outer span `"<Repository> > <method>"`, captures a throw and returns it through
 * `failure` (usually `dbOperationFailure(code)`, the error kept as `cause`); `query` wraps
 * one statement in an inner `db.query` span named by its SQL.
 */
export interface RepositoryTracer<E extends AppError> {
  query<T>(query: TracedQuery<T>): Promise<T>;
  method<T>(name: string, work: () => Promise<Result<T, E>>): Promise<Result<T, E>>;
}

export function repositoryTracer<E extends AppError>(
  instrumentation: IInstrumentation,
  repository: string,
  failure: (op: string, cause: unknown) => E,
): RepositoryTracer<E> {
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
          return Result.fail(failure(name, err));
        }
      }),
  };
}

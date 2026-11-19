import type { IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure, repositoryTracer as tracerOf } from "@packages/drizzle";
import type { AlertsError } from "../../application/ports/alert-repository.port";

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
  return tracerOf<AlertsError>(
    instrumentation,
    repository,
    dbOperationFailure("ALERT_PROVIDER_FAILURE"),
  );
}

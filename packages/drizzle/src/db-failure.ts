import type { AppError, ErrorCode } from "@packages/ddd-kit";

/**
 * Factory for the error a store returns when a query throws: the operation in the
 * message, never the driver's text, and the thrown error as `cause`, so the central
 * handler logs and captures the database reason without it reaching the client.
 */
export function dbOperationFailure<TCode extends ErrorCode>(code: TCode) {
  return (op: string, cause: unknown): AppError<TCode> => ({
    code,
    message: `database operation failed: ${op}`,
    cause,
  });
}

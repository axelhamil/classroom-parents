const STATUS_BY_SUFFIX = {
  _UNAUTHORIZED: 401,
  _REQUIRED: 401,
  _ACCEPTANCE_REQUIRED: 409,
  _REAUTH_REQUIRED: 403,
  _FORBIDDEN: 403,
  _NOT_FOUND: 404,
  _CONFLICT: 409,
  _BLOCKED: 409,
  _INVALID: 400,
  _INTEGRITY_FAILED: 422,
  _PAYMENT_REQUIRED: 402,
  _RATE_LIMITED: 429,
  _QUOTA_EXCEEDED: 429,
  _PROVIDER_FAILURE: 502,
  _UNAVAILABLE: 503,
  _TIMEOUT: 504,
  _ALREADY_CONNECTED: 409,
  _NOT_LINKED: 404,
  _SCOPES_MISSING: 403,
  _TOKEN_MISSING: 409,
  _INVALID_GRANT: 409,
  _AFTER_DEADLINE: 400,
  _IN_PAST: 400,
} as const satisfies Record<string, number>;

export type ErrorSuffix = keyof typeof STATUS_BY_SUFFIX;
export type ErrorStatus = (typeof STATUS_BY_SUFFIX)[ErrorSuffix];
export type ErrorCode = `${Uppercase<string>}${ErrorSuffix}`;

export interface AppError<Code extends ErrorCode = ErrorCode> {
  code: Code;
  message: string;
  metadata?: Record<string, unknown>;
  cause?: unknown;
}

const SUFFIXES = Object.keys(STATUS_BY_SUFFIX) as ErrorSuffix[];

function isErrorCode(code: string): code is ErrorCode {
  return SUFFIXES.some((suffix) => code.endsWith(suffix));
}

function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null || value instanceof Error) return false;
  if (!("code" in value) || !("message" in value)) return false;

  return (
    typeof value.code === "string" && typeof value.message === "string" && isErrorCode(value.code)
  );
}

export function httpStatusFromCode(code: ErrorCode): ErrorStatus {
  const suffix = [...SUFFIXES].sort((a, b) => b.length - a.length).find((s) => code.endsWith(s));
  if (!suffix) throw new Error(`Unreachable: code ${code} has no recognised suffix`);
  return STATUS_BY_SUFFIX[suffix];
}

export class AppErrorException extends Error {
  readonly code: ErrorCode;
  readonly metadata?: Record<string, unknown>;

  constructor(error: AppError) {
    super(error.message, { cause: error.cause });
    this.name = "AppErrorException";
    this.code = error.code;
    this.metadata = error.metadata;
  }
}

export function asException(error: unknown): unknown {
  return isAppError(error) ? new AppErrorException(error) : error;
}

import type { ChildDto } from "./api/children.queries";

export const SCHOOL_ERROR_KINDS = [
  "admin_blocked",
  "not_configured",
  "access_denied",
  "unknown",
] as const;

export type SchoolErrorKind = (typeof SCHOOL_ERROR_KINDS)[number];

const GOOGLE_CODES = [
  ["admin_policy_enforced", "admin_blocked"],
  ["access_not_configured", "not_configured"],
  ["access_denied", "access_denied"],
] as const satisfies readonly (readonly [string, SchoolErrorKind])[];

function fromOAuthRedirect(params: URLSearchParams): SchoolErrorKind {
  const reported = [params.get("error_description"), params.get("error")]
    .filter((value) => value !== null)
    .join(" ")
    .toLowerCase();
  const match = GOOGLE_CODES.find(([code]) => reported.includes(code));

  return match?.[1] ?? "unknown";
}

export function classifySchoolError(source: URLSearchParams | ChildDto): SchoolErrorKind {
  if (source instanceof URLSearchParams) return fromOAuthRedirect(source);

  return source.status === "blocked_by_school" ? "admin_blocked" : "unknown";
}

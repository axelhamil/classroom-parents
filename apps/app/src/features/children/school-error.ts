import type { ChildDto } from "./api/children.queries";

export const SCHOOL_BLOCK_KINDS = [
  "admin_blocked",
  "not_configured",
  "access_denied",
  "unknown",
] as const;

export const SCHOOL_ERROR_KINDS = [
  ...SCHOOL_BLOCK_KINDS,
  "already_linked",
  "link_refused",
] as const;

export type SchoolBlockKind = (typeof SCHOOL_BLOCK_KINDS)[number];
export type SchoolErrorKind = (typeof SCHOOL_ERROR_KINDS)[number];

const GOOGLE_CODES = [
  ["account_already_linked_to_different_user", "already_linked"],
  ["unable_to_link_account", "link_refused"],
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

export function isSchoolBlock(kind: SchoolErrorKind): kind is SchoolBlockKind {
  return SCHOOL_BLOCK_KINDS.some((blockKind) => blockKind === kind);
}

export function classifySchoolError(source: ChildDto): SchoolBlockKind;
export function classifySchoolError(source: URLSearchParams): SchoolErrorKind;
export function classifySchoolError(source: URLSearchParams | ChildDto): SchoolErrorKind {
  if (source instanceof URLSearchParams) return fromOAuthRedirect(source);

  return source.status === "blocked_by_school" ? "admin_blocked" : "unknown";
}

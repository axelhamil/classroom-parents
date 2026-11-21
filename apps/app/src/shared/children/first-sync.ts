import type { ChildDto } from "../api/queries/children";

/** A child whose Classroom account was read through once: the onboarding and the home both wait on it. */
export function isFirstSyncDone(child: ChildDto): boolean {
  return child.status === "connected" && !child.syncing && Boolean(child.lastSyncedAt);
}

/** A child read through at least once, whatever runs now: an established family, not a new one. */
export function wasReadOnce(child: ChildDto): boolean {
  return Boolean(child.lastSyncedAt);
}

export type AnalysisState = "blocked" | "reconnect" | "failed" | "reading" | "ready";

/** Where the first reading of a child stands: the onboarding and the first steps of the home both show it. */
export function analysisState(child: ChildDto, syncRequested: boolean): AnalysisState {
  if (child.status === "blocked_by_school") return "blocked";
  if (child.status !== "connected") return "reconnect";
  if (isFirstSyncDone(child)) return "ready";
  if (child.syncing || syncRequested) return "reading";

  return "failed";
}

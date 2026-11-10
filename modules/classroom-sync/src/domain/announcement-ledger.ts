import type { Option } from "@packages/ddd-kit";

export const LEDGER_OUTCOMES = ["extracted", "no_event", "failed", "abandoned"] as const;

export type LedgerOutcome = (typeof LEDGER_OUTCOMES)[number];

export const MAX_EXTRACTION_ATTEMPTS = 3;

export interface LedgerState {
  outcome: LedgerOutcome;
  attempts: number;
}

export interface LedgerVerdict {
  outcome: LedgerOutcome;
  attempts: number;
}

export function needsExtraction(state: Option<LedgerState>): boolean {
  return state.map(({ outcome }) => outcome === "failed").unwrapOr(true);
}

export function nextAttempt(state: Option<LedgerState>): number {
  return state.map(({ attempts }) => attempts + 1).unwrapOr(1);
}

export function extractedVerdict(attempt: number, eventCount: number): LedgerVerdict {
  return { outcome: eventCount > 0 ? "extracted" : "no_event", attempts: attempt };
}

export function failedVerdict(attempt: number): LedgerVerdict {
  return {
    outcome: attempt >= MAX_EXTRACTION_ATTEMPTS ? "abandoned" : "failed",
    attempts: attempt,
  };
}

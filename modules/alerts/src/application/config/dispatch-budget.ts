export const DISPATCH_LEASE_SECONDS = 60;
export const DISPATCH_BATCH = 20;
export const DISPATCH_CONCURRENCY = 10;
export const SEND_TIMEOUT_MS = 5_000;
export const DATABASE_MARGIN_MS = 5_000;
export const MAX_EMAIL_FAILURES = 5;

export type EmailRetry = "wait" | "retry" | "give_up";

export function emailRetryAfter(code: string, failures: number): EmailRetry {
  if (code === "ALERT_EMAIL_UNAVAILABLE") return "wait";
  if (code === "ALERT_EMAIL_INVALID" || failures + 1 >= MAX_EMAIL_FAILURES) return "give_up";

  return "retry";
}

export function worstCaseBatchMs(): number {
  const waves = Math.ceil(DISPATCH_BATCH / DISPATCH_CONCURRENCY);
  const perAlert = SEND_TIMEOUT_MS + SEND_TIMEOUT_MS;

  return waves * perAlert + DATABASE_MARGIN_MS;
}

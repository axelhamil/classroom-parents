export const DISPATCH_LEASE_SECONDS = 60;
export const DISPATCH_BATCH = 20;
export const DISPATCH_CONCURRENCY = 10;
export const SEND_TIMEOUT_MS = 5_000;
export const DATABASE_MARGIN_MS = 5_000;

export function worstCaseBatchMs(): number {
  const waves = Math.ceil(DISPATCH_BATCH / DISPATCH_CONCURRENCY);
  const perAlert = SEND_TIMEOUT_MS + SEND_TIMEOUT_MS;

  return waves * perAlert + DATABASE_MARGIN_MS;
}

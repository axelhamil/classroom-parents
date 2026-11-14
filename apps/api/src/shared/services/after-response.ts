export interface AfterResponseDeps {
  BackgroundWork: { settled(): Promise<void> };
  DeliveryDrain: { drain(): Promise<void> };
}

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const MUTATING_READ_PREFIX = "/api/auth/";
const CLOCK_PREFIX = "/internal/";

export function mayHaveWritten(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (path.startsWith(CLOCK_PREFIX)) return false;
  if (!READ_ONLY_METHODS.has(request.method)) return true;

  return path.startsWith(MUTATING_READ_PREFIX);
}

export async function afterResponse(deps: AfterResponseDeps, request: Request): Promise<void> {
  await deps.BackgroundWork.settled();
  if (!mayHaveWritten(request)) return;

  await deps.DeliveryDrain.drain();
}

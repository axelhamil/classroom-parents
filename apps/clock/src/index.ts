export interface ClockEnv {
  API_URL: string;
  CRON_SECRET: string;
}

export const TICK_TIMEOUT_MS = 50_000;

type Send = (url: URL, init: RequestInit) => Promise<Response>;

export async function tick(env: ClockEnv, send: Send = fetch): Promise<void> {
  const response = await send(new URL("/internal/tick", env.API_URL), {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    signal: AbortSignal.timeout(TICK_TIMEOUT_MS),
  });
  if (response.ok) return;

  const body = (await response.text()).slice(0, 2000);
  throw new Error(`/internal/tick answered ${response.status}: ${body}`);
}

export default {
  scheduled: (_controller: unknown, env: ClockEnv) => tick(env),
};

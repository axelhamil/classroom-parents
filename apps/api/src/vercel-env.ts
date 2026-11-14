import { envSchema } from "./shared/env-schema";

export const FUNCTION_MAX_DURATION_SECONDS = 300;

const STREAM_MARGIN_MS = 30_000;

const DEFAULTS = {
  STREAM_MAX_LIFETIME_MS: "240000",
  DATABASE_POOL_MAX: "5",
  RATE_LIMIT_POOL_MAX: "2",
  DATABASE_POOL_IDLE_TIMEOUT_MS: "1000",
} as const;

type Env = Readonly<Record<string, string | undefined>>;

function streamFitsTheFunction(env: Env): void {
  const lifetime = Number(env.STREAM_MAX_LIFETIME_MS ?? DEFAULTS.STREAM_MAX_LIFETIME_MS);
  const ceiling = FUNCTION_MAX_DURATION_SECONDS * 1000 - STREAM_MARGIN_MS;
  if (lifetime <= ceiling) return;

  throw new Error(
    `STREAM_MAX_LIFETIME_MS=${lifetime} outlives the ${FUNCTION_MAX_DURATION_SECONDS} s function: the platform would cut the stream with a 504 instead of ending it cleanly. Set it to ${ceiling} or less.`,
  );
}

export function vercelEnv(env: Env): Record<string, string> {
  streamFitsTheFunction(env);
  const unset = Object.entries(DEFAULTS).filter(([name]) => !env[name]);
  const applied: Record<string, string> = {
    ...Object.fromEntries(unset),
    RATE_LIMIT_STORE: "postgres",
  };
  if (env.VERCEL_ENV === "production") applied.NODE_ENV = "production";

  return applied;
}

export function productionEnvIssues(env: Env): string[] {
  const applied = Object.entries({ ...env, ...vercelEnv(env) }).map(([name, value]) => [
    name,
    value === "" ? undefined : value,
  ]);
  const parsed = envSchema.safeParse(Object.fromEntries(applied));
  if (parsed.success) return [];

  return parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

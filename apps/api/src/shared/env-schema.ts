import { z } from "zod";
import { validateEnvBounds, validateHostsEnv, validateTrustedProxiesEnv } from "./env-bounds";

const commaList = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    MIGRATIONS_FOLDER: z.string().default("./migrations"),
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_SECRETS: z
      .string()
      .transform((v) =>
        commaList(v).map((entry) => {
          const separator = entry.indexOf(":");
          return {
            version: separator < 0 ? entry : entry.slice(0, separator).trim(),
            value: separator < 0 ? "" : entry.slice(separator + 1).trim(),
          };
        }),
      )
      .pipe(
        z
          .array(
            z.object({
              version: z.string().regex(/^\d+$/).transform(Number),
              value: z.string().min(32),
            }),
          )
          .min(1),
      )
      .optional(),

    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().optional(),
    SERVER_IDLE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(255).default(120),
    SWEEP_DEADLINE_MS: z.coerce.number().int().min(1000).default(90_000),
    CORS_ORIGIN: z
      .string()
      .optional()
      .transform((v) => v?.split(",").map((s) => s.trim())),
    APP_ORIGIN: z.url(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    COOKIE_DOMAIN: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM: z.string().optional(),
    RGPD_GRACE_PERIOD_DAYS: z.coerce.number().int().min(0).default(7),
    RGPD_SWEEP_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    OUTBOX_LEASE_SECONDS: z.coerce.number().int().positive().default(120),
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    OUTBOX_DEAD_RETRY_HOURS: z.coerce.number().positive().default(6),
    OUTBOX_CONCURRENCY: z.coerce.number().int().positive().default(4),
    OUTBOX_HANDLER_BUDGET_SECONDS: z.coerce.number().int().positive().default(30),
    EMAIL_LEASE_SECONDS: z.coerce.number().int().positive().default(120),
    EMAIL_DEAD_RETRY_HOURS: z.coerce.number().positive().default(6),
    EMAIL_DEAD_REPLAY_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
    GIT_SHA: z.string().optional(),
    BUILD_TIME: z.string().optional(),
    SHUTDOWN_GRACE_PERIOD_MS: z.coerce.number().int().min(0).default(15_000),
    SHUTDOWN_STEP_TIMEOUT_MS: z.coerce.number().int().min(100).default(2_000),
    SHUTDOWN_WORKERS_TIMEOUT_MS: z.coerce.number().int().min(100).default(12_000),
    SHUTDOWN_DEADLINE_MS: z.coerce.number().int().min(1000).default(36_000),
    SENTRY_DSN: z.url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),
    TRUSTED_PROXIES: z.string().transform(commaList).optional(),
    CAPTCHA_SECRET_KEY: z.string().optional(),
    CAPTCHA_VERIFY_URL: z
      .url()
      .default("https://challenges.cloudflare.com/turnstile/v0/siteverify"),
    CAPTCHA_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  })
  .superRefine((value, ctx) => {
    validateEnvBounds(value, ctx);
    validateHostsEnv(value, ctx);
    validateTrustedProxiesEnv(value, ctx);
  });

type EnvKey = keyof z.infer<typeof envSchema>;

export const PRODUCTION_REQUIRED: ReadonlyArray<readonly [EnvKey, string]> = [
  [
    "CORS_ORIGIN",
    "CORS_ORIGIN is required in production (comma-separated allowed origins). Without it the API falls back to localhost, rejecting the real front and collapsing the CORS + CSRF allowlist.",
  ],
];

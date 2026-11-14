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
    DATABASE_URL_DIRECT: z.url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
    RATE_LIMIT_POOL_MAX: z.coerce.number().int().min(1).max(20).default(3),
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
    CRON_SECRET: z.string().min(32).optional(),
    CLOCK_TICK_BUDGET_MS: z.coerce.number().int().min(1000).max(280_000).default(40_000),
    STREAM_MAX_LIFETIME_MS: z.coerce.number().int().min(5_000).optional(),
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
    EMAIL_RETENTION_DAYS: z.coerce.number().int().min(1).max(7).default(7),
    ANTHROPIC_API_KEY: z.string().optional(),
    VAPID_PUBLIC_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}$/, "unpadded base64url of a 65-byte P-256 public key")
      .optional(),
    VAPID_PRIVATE_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/, "unpadded base64url of a 32-byte P-256 private key")
      .optional(),
    VAPID_SUBJECT: z
      .string()
      .regex(/^(mailto:|https:\/\/)/, "a mailto: address or an https:// URL")
      .optional(),
    FAKE_PROVIDERS: z.stringbool().default(false),
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
    validateProductionEnv(value, ctx);
  });

const PRODUCTION_REQUIRED = {
  CORS_ORIGIN:
    "comma-separated allowed origins; without it the API falls back to localhost, rejecting the real front and collapsing the CORS + CSRF allowlist",
  COOKIE_DOMAIN:
    "parent domain of the app and api hosts; without it the session cookie stays on the api host and the app is signed out",
  ANTHROPIC_API_KEY: "the announcement extraction calls the model with it",
  VAPID_PUBLIC_KEY: "signs every web push alert, generate with bunx web-push generate-vapid-keys",
  VAPID_PRIVATE_KEY: "signs every web push alert, generate with bunx web-push generate-vapid-keys",
  VAPID_SUBJECT: "contact the push services reach, mailto: or https://",
  RESEND_API_KEY: "sends the alert email when a parent has no live push subscription",
  RESEND_FROM: "sender address on the verified Resend domain",
} as const;

type ProductionRequiredKey = keyof typeof PRODUCTION_REQUIRED;

function isProductionRequiredKey(key: string): key is ProductionRequiredKey {
  return key in PRODUCTION_REQUIRED;
}

function validateProductionEnv(
  value: { NODE_ENV: string; FAKE_PROVIDERS: boolean } & Partial<
    Record<ProductionRequiredKey, string | string[]>
  >,
  ctx: z.RefinementCtx,
): void {
  if (value.NODE_ENV !== "production") return;

  if (value.FAKE_PROVIDERS) {
    ctx.addIssue({
      code: "custom",
      path: ["FAKE_PROVIDERS"],
      message:
        "FAKE_PROVIDERS is refused in production: the fake Classroom, extractor and push sink would replace the real providers.",
    });
  }

  for (const key of Object.keys(PRODUCTION_REQUIRED).filter(isProductionRequiredKey)) {
    const current = value[key];
    if (current !== undefined && current.length > 0) continue;

    ctx.addIssue({
      code: "custom",
      path: [key],
      message: `${key} is required in production: ${PRODUCTION_REQUIRED[key]}.`,
    });
  }
}

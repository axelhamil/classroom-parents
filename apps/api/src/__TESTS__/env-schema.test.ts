import { describe, expect, it } from "bun:test";
import { envSchema } from "../shared/env-schema";

const PRODUCTION_ENV = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pass@db.internal:5432/classroom",
  BETTER_AUTH_URL: "https://api.example.com",
  BETTER_AUTH_SECRET: "a".repeat(44),
  APP_ORIGIN: "https://app.example.com",
  CORS_ORIGIN: "https://app.example.com",
  COOKIE_DOMAIN: "example.com",
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "client-secret",
  ANTHROPIC_API_KEY: "sk-ant-dummy",
  VAPID_PUBLIC_KEY: "B".repeat(87),
  VAPID_PRIVATE_KEY: "p".repeat(43),
  VAPID_SUBJECT: "mailto:contact@example.com",
  RESEND_API_KEY: "re_dummy",
  RESEND_FROM: "KeepUpKids <alertes@example.com>",
};

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_SECRET",
  "APP_ORIGIN",
  "CORS_ORIGIN",
  "COOKIE_DOMAIN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ANTHROPIC_API_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "RESEND_API_KEY",
  "RESEND_FROM",
] as const;

function failingKeys(raw: Record<string, string | undefined>): string[] {
  const result = envSchema.safeParse(raw);
  if (result.success) return [];

  return result.error.issues.map((issue) => String(issue.path[0]));
}

describe("env contract at boot", () => {
  it("boots in production with every required variable and no optional one", () => {
    expect(envSchema.safeParse(PRODUCTION_ENV).success).toBe(true);
  });

  for (const key of REQUIRED) {
    it(`refuses a production boot without ${key}, naming it`, () => {
      expect(failingKeys({ ...PRODUCTION_ENV, [key]: undefined })).toContain(key);
    });
  }

  it("boots in development without the provider keys, so fakes and local runs need none", () => {
    const development = {
      NODE_ENV: "development",
      DATABASE_URL: "postgres://postgres:postgres@localhost:54329/classroom_parents",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "a".repeat(44),
      APP_ORIGIN: "http://localhost:5173",
      GOOGLE_CLIENT_ID: "local",
      GOOGLE_CLIENT_SECRET: "local",
    };

    expect(failingKeys(development)).toEqual([]);
  });

  it("refuses fake providers in production", () => {
    expect(failingKeys({ ...PRODUCTION_ENV, FAKE_PROVIDERS: "1" })).toContain("FAKE_PROVIDERS");
  });

  it("refuses a VAPID subject that is neither a mailto nor an https URL", () => {
    expect(failingKeys({ ...PRODUCTION_ENV, VAPID_SUBJECT: "contact@example.com" })).toContain(
      "VAPID_SUBJECT",
    );
  });

  it("refuses a VAPID key that is not an unpadded base64url P-256 key", () => {
    expect(failingKeys({ ...PRODUCTION_ENV, VAPID_PUBLIC_KEY: "not-a-key" })).toContain(
      "VAPID_PUBLIC_KEY",
    );
  });

  it("keeps sent emails 7 days at most", () => {
    expect(failingKeys({ ...PRODUCTION_ENV, EMAIL_RETENTION_DAYS: "8" })).toContain(
      "EMAIL_RETENTION_DAYS",
    );
    expect(envSchema.parse(PRODUCTION_ENV).EMAIL_RETENTION_DAYS).toBe(7);
  });
});

import { describe, expect, it } from "bun:test";
import { FUNCTION_MAX_DURATION_SECONDS, productionEnvIssues, vercelEnv } from "../vercel-env";

const productionEnv = {
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://app@pooler.example.org:6543/postgres",
  DATABASE_URL_DIRECT: "postgresql://app@pooler.example.org:5432/postgres",
  BETTER_AUTH_URL: "https://api.example.org",
  BETTER_AUTH_SECRET: "a-production-secret-of-at-least-32-chars",
  APP_ORIGIN: "https://app.example.org",
  CORS_ORIGIN: "https://app.example.org",
  COOKIE_DOMAIN: "example.org",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  ANTHROPIC_API_KEY: "anthropic-key",
  VAPID_PUBLIC_KEY: "B".repeat(87),
  VAPID_PRIVATE_KEY: "p".repeat(43),
  VAPID_SUBJECT: "mailto:contact@example.org",
  RESEND_API_KEY: "resend-key",
  RESEND_FROM: "KeepUpKids <alertes@example.org>",
  CRON_SECRET: "c".repeat(64),
};

describe("vercelEnv", () => {
  it("ends a live stream before the function limit cuts it", () => {
    const lifetime = Number(vercelEnv({}).STREAM_MAX_LIFETIME_MS);

    expect(lifetime).toBeLessThan(FUNCTION_MAX_DURATION_SECONDS * 1000);
  });

  it("keeps the rate limits shared across instances even when memory was asked for", () => {
    expect(vercelEnv({ RATE_LIMIT_STORE: "memory" }).RATE_LIMIT_STORE).toBe("postgres");
  });

  it("leaves a value the project sets to that value", () => {
    const applied = vercelEnv({ DATABASE_POOL_MAX: "8", STREAM_MAX_LIFETIME_MS: "120000" });

    expect(applied.DATABASE_POOL_MAX).toBeUndefined();
    expect(applied.STREAM_MAX_LIFETIME_MS).toBeUndefined();
  });

  it("runs a production deployment with the production rules, without the build seeing them", () => {
    expect(vercelEnv({ VERCEL_ENV: "production" }).NODE_ENV).toBe("production");
    expect(vercelEnv({ VERCEL_ENV: "preview" }).NODE_ENV).toBeUndefined();
  });

  it("refuses a stream lifetime the function would cut with a 504", () => {
    expect(() => vercelEnv({ STREAM_MAX_LIFETIME_MS: "300000" })).toThrow(
      "STREAM_MAX_LIFETIME_MS=300000 outlives the 300 s function",
    );
  });
});

describe("productionEnvIssues", () => {
  it("lets a complete production environment through", () => {
    expect(productionEnvIssues(productionEnv)).toEqual([]);
  });

  it("names every variable production needs and the deployment lacks, before it can be promoted", () => {
    const {
      COOKIE_DOMAIN: _cookie,
      ANTHROPIC_API_KEY: _model,
      VAPID_PRIVATE_KEY: _vapid,
      RESEND_API_KEY: _email,
      ...incomplete
    } = productionEnv;

    const names = productionEnvIssues(incomplete).map((issue) => issue.split(":")[0]);

    expect(names).toEqual(
      expect.arrayContaining([
        "COOKIE_DOMAIN",
        "ANTHROPIC_API_KEY",
        "VAPID_PRIVATE_KEY",
        "RESEND_API_KEY",
      ]),
    );
  });

  it("reads an empty variable as a missing one, as the api boot does", () => {
    const names = productionEnvIssues({ ...productionEnv, RESEND_FROM: "" }).map(
      (issue) => issue.split(":")[0],
    );

    expect(names).toContain("RESEND_FROM");
  });
});

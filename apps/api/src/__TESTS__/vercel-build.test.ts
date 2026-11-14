import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  literalDrizzleImports,
  migrationPlan,
  RATE_LIMITER_DRIZZLE_FILE,
} from "../../scripts/vercel-build";

const direct = "postgresql://owner@db.example.org/keepupkids";

describe("migrationPlan", () => {
  it("migrates a production deployment through the direct database URL", () => {
    expect(migrationPlan({ VERCEL_ENV: "production", DATABASE_URL_DIRECT: direct })).toEqual({
      run: true,
      databaseUrl: direct,
    });
  });

  it("never migrates a preview deployment, even one that can reach the database", () => {
    expect(migrationPlan({ VERCEL_ENV: "preview", DATABASE_URL_DIRECT: direct }).run).toBe(false);
  });

  it("never migrates a build outside Vercel", () => {
    expect(migrationPlan({ DATABASE_URL_DIRECT: direct }).run).toBe(false);
  });

  it("fails a production build that has no direct database URL", () => {
    expect(() => migrationPlan({ VERCEL_ENV: "production" })).toThrow("DATABASE_URL_DIRECT");
  });
});

describe("literalDrizzleImports", () => {
  it("bundles the rate limiter's drizzle import, which the function could not resolve at runtime", () => {
    const bundled = literalDrizzleImports(readFileSync(RATE_LIMITER_DRIZZLE_FILE, "utf8"));

    expect(bundled).toContain('import("drizzle-orm")');
    expect(bundled).toContain('import("drizzle-orm/sql")');
    /* biome-ignore lint/suspicious/noTemplateCurlyInString: the library's source text, matched verbatim */
    expect(bundled).not.toContain("${getPackageName()}");
  });

  it("fails the build when the library no longer loads drizzle the way the bundle expects", () => {
    expect(() => literalDrizzleImports("export {};")).toThrow("rate-limiter-flexible");
  });
});

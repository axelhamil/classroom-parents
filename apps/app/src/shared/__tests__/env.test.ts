import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAppEnv } from "../env.schema";

async function loadEnv() {
  vi.resetModules();
  return (await import("../env")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env", () => {
  // `.env.example` ships these keys blank. Read as "", the Sentry environment
  // was "" instead of falling back to the build mode, and the release was "".
  it("treats every blank optional key as absent", async () => {
    for (const key of ["VITE_SENTRY_DSN", "VITE_SENTRY_ENVIRONMENT", "VITE_GIT_SHA"]) {
      vi.stubEnv(key, "");
    }

    const env = await loadEnv();

    expect(env.VITE_SENTRY_DSN).toBeUndefined();
    expect(env.VITE_SENTRY_ENVIRONMENT).toBeUndefined();
    expect(env.VITE_GIT_SHA).toBeUndefined();
  });

  it("keeps a set value", async () => {
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "staging");

    expect((await loadEnv()).VITE_SENTRY_ENVIRONMENT).toBe("staging");
  });

  it("still rejects a malformed url", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "not a url");

    await expect(loadEnv()).rejects.toThrow();
  });

  it("refuses a back office URL that is not a bare origin", async () => {
    vi.stubEnv("VITE_ADMIN_URL", "https://admin.example.com/back");

    await expect(loadEnv()).rejects.toThrow();
  });

  it("refuses a missing or blank contact address, which fails the build", () => {
    expect(() => parseAppEnv({ VITE_API_URL: "https://api.example.com" })).toThrow(
      /VITE_CONTACT_EMAIL/,
    );
    expect(() => parseAppEnv({ VITE_CONTACT_EMAIL: "" })).toThrow(/VITE_CONTACT_EMAIL/);
  });

  it.each(["VITE_API_URL", "VITE_SITE_URL"])(
    "refuses a missing or blank %s, which would bake localhost into the build",
    (key) => {
      const complete = {
        VITE_API_URL: "https://api.example.com",
        VITE_SITE_URL: "https://example.com",
        VITE_CONTACT_EMAIL: "contact@example.com",
      };

      expect(() => parseAppEnv({ ...complete, [key]: undefined })).toThrow(key);
      expect(() => parseAppEnv({ ...complete, [key]: "" })).toThrow(key);
    },
  );
});

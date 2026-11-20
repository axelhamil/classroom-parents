import { describe, expect, it } from "vitest";
import { parseSiteEnv } from "../env.schema";

const COMPLETE = {
  PUBLIC_SITE_URL: "https://example.com",
  PUBLIC_APP_URL: "https://app.example.com",
  PUBLIC_GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com",
  PUBLIC_CONTACT_EMAIL: "contact@example.com",
};

describe("the site env", () => {
  it("accepts bare origins", () => {
    const env = parseSiteEnv(COMPLETE);

    expect(env.PUBLIC_APP_URL).toBe("https://app.example.com");
  });

  it.each(["https://example.com/", "https://example.com/fr", "not a url"])(
    "refuses %s, which would break the links built from it",
    (value) => {
      expect(() => parseSiteEnv({ ...COMPLETE, PUBLIC_SITE_URL: value })).toThrow(
        /PUBLIC_SITE_URL/,
      );
    },
  );

  it.each(Object.keys(COMPLETE))(
    "refuses a missing or blank %s, which would bake a wrong value into the build",
    (key) => {
      expect(() => parseSiteEnv({ ...COMPLETE, [key]: undefined })).toThrow(key);
      expect(() => parseSiteEnv({ ...COMPLETE, [key]: "" })).toThrow(key);
    },
  );
});

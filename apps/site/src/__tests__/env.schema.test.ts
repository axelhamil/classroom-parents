import { describe, expect, it } from "vitest";
import { parseSiteEnv } from "../env.schema";

describe("the site env", () => {
  it("accepts bare origins", () => {
    const env = parseSiteEnv({
      PUBLIC_SITE_URL: "https://example.com",
      PUBLIC_APP_URL: "https://app.example.com",
    });

    expect(env.PUBLIC_APP_URL).toBe("https://app.example.com");
  });

  it.each(["https://example.com/", "https://example.com/fr", "not a url"])(
    "refuses %s, which would break the links built from it",
    (value) => {
      expect(() => parseSiteEnv({ PUBLIC_SITE_URL: value })).toThrow();
    },
  );
});

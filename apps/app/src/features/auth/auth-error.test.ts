import { describe, expect, it } from "vitest";
import { resolveAuthError } from "./auth-error";

const t = ((key: string) => key) as never;
const tErrors = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === "bySuffix.RATE_LIMITED") return "Too many requests. Please wait a moment.";
  return opts?.defaultValue ?? key;
}) as never;

describe("resolveAuthError", () => {
  it("returns the rate-limit copy when status is 429", () => {
    expect(resolveAuthError({ status: 429, message: "Too many" }, "login.failed", t, tErrors)).toBe(
      "Too many requests. Please wait a moment.",
    );
  });

  it("returns the mapped code copy when the error carries a known code", () => {
    const withDefault = ((key: string, opts?: { defaultValue?: string }) => {
      if (key === "byCode.ACCOUNT_PASSWORD_INVALID") return "Invalid password.";
      return opts?.defaultValue ?? key;
    }) as never;
    expect(
      resolveAuthError(
        { status: 401, code: "ACCOUNT_PASSWORD_INVALID" },
        "login.failed",
        t,
        withDefault,
      ),
    ).toBe("Invalid password.");
  });

  it("reads the code of a refusal in the API envelope, raised before BetterAuth", () => {
    const withCaptchaCopy = ((key: string, opts?: { defaultValue?: string }) => {
      if (key === "byCode.CAPTCHA_REQUIRED") return "Complete the captcha.";
      return opts?.defaultValue ?? key;
    }) as never;
    expect(
      resolveAuthError(
        { status: 401, error: { code: "CAPTCHA_REQUIRED" } },
        "login.failed",
        t,
        withCaptchaCopy,
      ),
    ).toBe("Complete the captcha.");
  });

  it("returns the caller fallback key translation when message and code are absent", () => {
    expect(resolveAuthError({ status: 500 }, "login.failed", t, tErrors)).toBe("login.failed");
  });
});

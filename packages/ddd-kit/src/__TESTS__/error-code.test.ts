import { describe, expect, it } from "vitest";
import { AppErrorException, asException, httpStatusFromCode } from "../application/error-code";

describe("httpStatusFromCode", () => {
  it("resolves BILLING_PAYMENT_REQUIRED to 402, not 401 (shadowing regression)", () => {
    expect(httpStatusFromCode("BILLING_PAYMENT_REQUIRED")).toBe(402);
  });

  it("resolves a plain _REQUIRED suffix to 401", () => {
    expect(httpStatusFromCode("SOMETHING_REQUIRED")).toBe(401);
  });

  it("resolves ADMIN_REAUTH_REQUIRED to 403: the session is fine, the action needs a code", () => {
    expect(httpStatusFromCode("ADMIN_REAUTH_REQUIRED")).toBe(403);
  });

  it("resolves POLICY_ACCEPTANCE_REQUIRED to 409, not 401 (shadowing regression)", () => {
    expect(httpStatusFromCode("POLICY_ACCEPTANCE_REQUIRED")).toBe(409);
  });

  it("resolves _NOT_FOUND to 404", () => {
    expect(httpStatusFromCode("X_NOT_FOUND")).toBe(404);
  });

  it("resolves BILLING_QUOTA_EXCEEDED to 429", () => {
    expect(httpStatusFromCode("BILLING_QUOTA_EXCEEDED")).toBe(429);
  });

  it("resolves the child account codes the linking flow returns", () => {
    expect(httpStatusFromCode("CHILD_ALREADY_CONNECTED")).toBe(409);
    expect(httpStatusFromCode("CHILD_ACCOUNT_NOT_LINKED")).toBe(404);
    expect(httpStatusFromCode("CHILD_SCOPES_MISSING")).toBe(403);
    expect(httpStatusFromCode("CHILD_REFRESH_TOKEN_MISSING")).toBe(409);
    expect(httpStatusFromCode("CHILD_TOKEN_INVALID_GRANT")).toBe(409);
  });

  it("resolves the alert time codes to 400 so the alert form shows them inline", () => {
    expect(httpStatusFromCode("ALERT_AFTER_DEADLINE")).toBe(400);
    expect(httpStatusFromCode("ALERT_IN_PAST")).toBe(400);
  });
});

describe("asException", () => {
  it("turns an AppError value into an exception chained to its cause", () => {
    const cause = new Error("relation does not exist");

    const exception = asException({ code: "X_PROVIDER_FAILURE", message: "failed", cause });

    expect(exception).toBeInstanceOf(AppErrorException);
    expect(exception).toMatchObject({ code: "X_PROVIDER_FAILURE", message: "failed", cause });
  });
});

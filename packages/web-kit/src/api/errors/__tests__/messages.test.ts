import frCatalog from "@packages/i18n/src/catalogs/fr";
import { describe, expect, it } from "vitest";
import { catalogT } from "../../../i18n/__tests__/catalog-t";
import { formatApiError } from "../messages";

const t = catalogT(frCatalog.errors);

describe("formatApiError", () => {
  it("prefers an exact code over a suffix", () => {
    expect(formatApiError({ code: "ACCOUNT_PASSWORD_INVALID" }, "fb", t)).toBe(
      "Mot de passe invalide.",
    );
  });

  it("falls back to the suffix table", () => {
    expect(formatApiError({ code: "WEBHOOK_NOT_FOUND" }, "fb", t)).toBe("Introuvable.");
  });

  it("matches the longest suffix, not the first", () => {
    expect(formatApiError({ code: "AUDIT_INTEGRITY_FAILED" }, "fb", t)).toBe(
      "Le contrôle d'intégrité a échoué. Veuillez réessayer.",
    );
  });

  it("returns the caller fallback for an unknown code", () => {
    expect(formatApiError({ code: "SOMETHING_WEIRD" }, "fb", t)).toBe("fb");
  });

  it("returns the caller fallback for a non-object error", () => {
    expect(formatApiError(new Error("boom"), "fb", t)).toBe("fb");
  });

  it("surfaces the server message for a 4xx the catalog does not cover", () => {
    expect(formatApiError({ status: 400, message: "url: Enter a valid https URL" }, "fb", t)).toBe(
      "url: Enter a valid https URL",
    );
  });

  it("resolves an HTTP_<status> code (no business code) through the byStatus table", () => {
    expect(formatApiError({ status: 400, code: "HTTP_400", message: "url: bad" }, "fb", t)).toBe(
      frCatalog.errors.byStatus["400"],
    );
    expect(formatApiError({ status: 403, code: "HTTP_403", message: "raw" }, "fb", t)).toBe(
      frCatalog.errors.byStatus["403"],
    );
  });

  it("falls through to the server message for a status HTTP_<status> does not cover", () => {
    expect(
      formatApiError({ status: 418, code: "HTTP_418", message: "I'm a teapot" }, "fb", t),
    ).toBe("I'm a teapot");
  });

  it("keeps the localised fallback for a network failure and for a 5xx", () => {
    expect(formatApiError(Object.assign(new Error("Failed to fetch")), "fb", t)).toBe("fb");
    expect(formatApiError({ status: 500, message: "Internal Server Error" }, "fb", t)).toBe("fb");
  });

  it("resolves the validator code through the suffix table", () => {
    expect(formatApiError({ status: 400, code: "REQUEST_INVALID", message: "raw" }, "fb", t)).toBe(
      frCatalog.errors.byCode.REQUEST_INVALID,
    );
  });

  it("resolves the impersonation refusal to its own copy, not the generic 403", () => {
    expect(
      formatApiError({ code: "IMPERSONATION_ACTION_FORBIDDEN", status: 403 }, "fallback", t),
    ).toBe(frCatalog.errors.byCode.IMPERSONATION_ACTION_FORBIDDEN);
  });

  it("resolves the policy refusal to its own copy, not the generic 409", () => {
    expect(formatApiError({ code: "POLICY_ACCEPTANCE_REQUIRED", status: 409 }, "fallback", t)).toBe(
      frCatalog.errors.byCode.POLICY_ACCEPTANCE_REQUIRED,
    );
    expect(frCatalog.errors.byCode.POLICY_ACCEPTANCE_REQUIRED).not.toBe(
      frCatalog.errors.byStatus["409"],
    );
  });

  it("resolves a quota refusal through the suffix table", () => {
    expect(formatApiError({ code: "BILLING_QUOTA_EXCEEDED", status: 429 }, "fallback", t)).toBe(
      frCatalog.errors.bySuffix.QUOTA_EXCEEDED,
    );
  });
});

import frCatalog from "@packages/i18n/src/catalogs/fr";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { applyZodErrorMap } from "../zod-error-map";
import { catalogT } from "./catalog-t";

const passwordSchema = z.object({ password: z.string().min(1) });

function passwordIssueMessage() {
  const result = passwordSchema.safeParse({ password: "" });
  if (result.success) throw new Error("expected the empty password to fail validation");
  const passwordIssue = result.error.issues.find((issue) => issue.path[0] === "password");
  if (!passwordIssue) throw new Error("expected a password issue");
  return passwordIssue.message;
}

describe("applyZodErrorMap", () => {
  it("localizes a required-field failure to French under locale fr", () => {
    applyZodErrorMap(catalogT(frCatalog.errors));
    expect(passwordIssueMessage()).toBe(frCatalog.errors.validation.required);
  });

  it("resolves a custom check's i18nKey and ignores a key the catalog lacks", () => {
    applyZodErrorMap(catalogT(frCatalog.errors));
    const known = z.string().refine(() => false, { params: { i18nKey: "validation.httpsUrl" } });
    const unknown = z.string().refine(() => false, { params: { i18nKey: "validation.nope" } });

    expect(known.safeParse("x").error?.issues[0]?.message).toBe(
      frCatalog.errors.validation.httpsUrl,
    );
    expect(unknown.safeParse("x").error?.issues[0]?.message).not.toBe("validation.nope");
  });
});

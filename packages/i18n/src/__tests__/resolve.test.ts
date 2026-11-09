import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES } from "../locales";
import { resolveLocale } from "../resolve";

describe("LOCALES", () => {
  it("is French only, with fr as the default", () => {
    expect(LOCALES).toEqual(["fr"]);
    expect(DEFAULT_LOCALE).toBe("fr");
  });
});

describe("isLocale", () => {
  it("accepts supported locales and rejects everything else", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("en")).toBe(false);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("")).toBe(false);
  });
});

describe("resolveLocale", () => {
  it("returns the first supported candidate", () => {
    expect(resolveLocale(["fr", "en"])).toBe("fr");
  });

  it("strips a region subtag so fr-BE resolves to fr", () => {
    expect(resolveLocale(["fr-BE"])).toBe("fr");
  });

  it("is case-insensitive", () => {
    expect(resolveLocale(["FR-be"])).toBe("fr");
  });

  it("skips unsupported candidates rather than failing", () => {
    expect(resolveLocale(["de", "es", "fr"])).toBe("fr");
  });

  it("falls back to the default when nothing matches", () => {
    expect(resolveLocale(["en", "de"])).toBe("fr");
    expect(resolveLocale([])).toBe("fr");
  });

  it("ignores empty and malformed candidates", () => {
    expect(resolveLocale(["", "  ", "-", "fr"])).toBe("fr");
  });
});

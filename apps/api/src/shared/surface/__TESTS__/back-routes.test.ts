import { describe, expect, it } from "bun:test";
import { listBackRoutes } from "../back-routes";

describe("app module", () => {
  it("can be imported without booting workers or touching the database", async () => {
    const mod = await import("../../../app");
    expect(Array.isArray(mod.routes.routes)).toBe(true);
    expect(mod.routes.routes.length).toBeGreaterThan(0);
  });
});

describe("listBackRoutes", () => {
  it("returns METHOD /path keys with mount prefixes resolved", () => {
    const keys = listBackRoutes();
    expect(keys).toContain("POST /me/delete");
    expect(keys).toContain("DELETE /me/delete");
    expect(keys).toContain("GET /livez");
  });

  it("collapses the BetterAuth wildcard into a single opaque row", () => {
    const keys = listBackRoutes();
    const authKeys = keys.filter((k) => k.includes("/api/auth"));
    expect(authKeys).toEqual(["ALL /api/auth/*"]);
  });

  it("is sorted and free of duplicates", () => {
    const keys = listBackRoutes();
    expect(keys).toEqual([...new Set(keys)].sort());
  });

  it("excludes Hono's implicit middleware entries", () => {
    expect(listBackRoutes().some((k) => k.endsWith(" /*"))).toBe(false);
  });
});

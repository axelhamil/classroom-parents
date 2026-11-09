import { describe, expect, it } from "bun:test";
import { requireLocalDatabase } from "../../packages/test/src/db-check";
import { databaseNameFor } from "../worktree-db-name";

describe("databaseNameFor", () => {
  it("derives the database name from the branch", () => {
    expect(databaseNameFor("feat/children-module")).toBe("classroom_parents_feat_children_module");
  });

  it("lowercases an uppercase branch", () => {
    expect(databaseNameFor("Fix/Sync-Worker")).toBe("classroom_parents_fix_sync_worker");
  });

  it("truncates a long branch to the 63 characters Postgres keeps", () => {
    const name = databaseNameFor(`feat/${"a".repeat(80)}`);

    expect(name).toHaveLength(63);
    expect(name).toMatch(/^classroom_parents_feat_a+$/);
  });
});

describe("requireLocalDatabase", () => {
  const local = "postgresql://postgres:postgres@localhost:54329/classroom_parents_feat_children";

  it("accepts a project database on localhost or 127.0.0.1", () => {
    expect(() => requireLocalDatabase(local)).not.toThrow();
    expect(() =>
      requireLocalDatabase("postgresql://postgres:postgres@127.0.0.1:54329/classroom_parents"),
    ).not.toThrow();
  });

  it("rejects the port of another project", () => {
    expect(() =>
      requireLocalDatabase("postgresql://postgres:postgres@localhost:5433/classroom_parents"),
    ).toThrow(/54329/);
  });

  it("rejects a remote host", () => {
    expect(() =>
      requireLocalDatabase("postgresql://postgres:postgres@db.example.com:54329/classroom_parents"),
    ).toThrow(/localhost/);
  });

  it("rejects a database name outside the project pattern", () => {
    expect(() =>
      requireLocalDatabase("postgresql://postgres:postgres@localhost:54329/production"),
    ).toThrow(/classroom_parents/);
  });

  it("rejects a missing url", () => {
    expect(() => requireLocalDatabase(undefined)).toThrow();
  });
});

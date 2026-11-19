import { describe, expect, it } from "bun:test";
import { getTableColumns } from "@packages/drizzle";
import { getTableConfig } from "drizzle-orm/pg-core";
import { aiCall } from "../../schemas/ai-call.schema";

describe("ai_call journal", () => {
  it("has no column where free text could land: every text column is an enum or a checked format", () => {
    const checked = getTableConfig(aiCall).checks.map((constraint) => constraint.name);
    const textColumns = Object.values(getTableColumns(aiCall)).filter(
      (column) => column.dataType === "string" && column.columnType === "PgText",
    );
    const unconstrained = textColumns.filter(
      (column) =>
        column.name !== "user_id" &&
        (column.enumValues ?? []).length === 0 &&
        !checked.some((name) => name.startsWith(`ai_call_${column.name}`)),
    );

    expect(textColumns.length).toBeGreaterThan(0);
    expect(unconstrained.map((column) => column.name)).toEqual([]);
  });
});

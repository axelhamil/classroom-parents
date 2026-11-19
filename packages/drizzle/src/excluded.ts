import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * The value an upsert tried to insert in `column`, for the `set` or `setWhere` of an
 * `onConflictDoUpdate`. The builder has no helper for Postgres' `excluded` row; the column
 * stays typed, so a rename breaks the build instead of the query.
 */
export function excluded(column: AnyPgColumn): SQL {
  return sql`excluded.${sql.identifier(column.name)}`;
}

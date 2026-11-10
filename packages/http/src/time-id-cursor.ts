import { type AnyPgColumn, and, gt, lt, or, type SQL, sql } from "@packages/drizzle";
import { z } from "zod";

const SEPARATOR = "~";
const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2})(?::?(\d{2}))?)?$/;
const MAX_OFFSET_HOURS = 15;
const rowId = z.uuid();

export interface TimeIdCursor {
  at: string;
  id: string;
}

function isRealInstant(at: string): boolean {
  const parts = INSTANT.exec(at);
  if (!parts) return false;

  const [year, month, day, hour, minute, second, offsetHours, offsetMinutes] = parts
    .slice(1)
    .map((part) => Number(part ?? 0));
  const wall = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return (
    wall.getUTCFullYear() === year &&
    wall.getUTCMonth() + 1 === month &&
    wall.getUTCDate() === day &&
    Number(hour) < 24 &&
    Number(minute) < 60 &&
    Number(second) < 60 &&
    Number(offsetHours) <= MAX_OFFSET_HOURS &&
    Number(offsetMinutes) < 60
  );
}

export const timeIdCursorSchema = z.string().transform((raw, ctx): TimeIdCursor => {
  const cut = raw.indexOf(SEPARATOR);
  const at = raw.slice(0, Math.max(cut, 0));
  const id = raw.slice(cut + 1);
  if (cut > 0 && rowId.safeParse(id).success && isRealInstant(at)) return { at, id };

  ctx.addIssue({ code: "custom", message: "This cursor was not issued by this list." });

  return z.NEVER;
});

export function encodeTimeIdCursor(at: string, id: string): string {
  return `${at}${SEPARATOR}${id}`;
}

export function exactInstant(column: AnyPgColumn): SQL<string> {
  return sql<string>`${column}::text`;
}

export function afterTimeIdCursor(
  timeColumn: AnyPgColumn,
  idColumn: AnyPgColumn,
  cursor: TimeIdCursor,
  order: "asc" | "desc" = "desc",
): SQL | undefined {
  const beyond =
    order === "asc" ? sql`${timeColumn} > ${cursor.at}` : sql`${timeColumn} < ${cursor.at}`;
  const tieBreak = order === "asc" ? gt(idColumn, cursor.id) : lt(idColumn, cursor.id);

  return or(beyond, and(sql`${timeColumn} = ${cursor.at}`, tieBreak));
}

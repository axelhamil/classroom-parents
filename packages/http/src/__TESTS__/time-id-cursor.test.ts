import { describe, expect, it } from "bun:test";
import { outboxSchema, QueryBuilder } from "@packages/drizzle";
import { afterTimeIdCursor, encodeTimeIdCursor, timeIdCursorSchema } from "../time-id-cursor";

const ROW_ID = "0196a000-0000-7000-8000-000000000001";

describe("time and id cursor", () => {
  it("round-trips a microsecond instant, which a Date would truncate and skip rows", () => {
    const at = "2026-10-30 16:41:00.816759";

    expect(timeIdCursorSchema.parse(encodeTimeIdCursor(at, ROW_ID))).toEqual({ at, id: ROW_ID });
  });

  it("reads the instant Postgres prints for a timestamptz", () => {
    const at = "2030-06-10 21:59:00+00";

    expect(timeIdCursorSchema.parse(encodeTimeIdCursor(at, ROW_ID))).toEqual({ at, id: ROW_ID });
  });

  it("refuses what the list never issued", () => {
    expect(timeIdCursorSchema.safeParse("not-a-cursor").success).toBe(false);
    expect(timeIdCursorSchema.safeParse("2026-10-30T10:00:00.000Z").success).toBe(false);
  });

  it.each([
    ["an id that is not a uuid", encodeTimeIdCursor("2030-06-10 21:59:00+00", "not-a-uuid")],
    ["a month and an hour out of range", encodeTimeIdCursor("2030-13-45 99:00:00+00", ROW_ID)],
    ["a day the month does not have", encodeTimeIdCursor("2030-02-31 10:00:00+00", ROW_ID)],
    ["a minute out of range", encodeTimeIdCursor("2030-06-10 10:60:00", ROW_ID)],
    ["an offset out of range", encodeTimeIdCursor("2030-06-10 10:00:00+16", ROW_ID)],
  ])("refuses a forged cursor with %s, before the database sees it", (_label, raw) => {
    expect(timeIdCursorSchema.safeParse(raw).success).toBe(false);
  });
});

describe("rows after a cursor", () => {
  const table = outboxSchema.outboxEvent;
  const cursor = { at: "2030-06-10 21:59:00+00", id: ROW_ID };
  const render = (order?: "asc" | "desc") =>
    new QueryBuilder()
      .select({ id: table.id })
      .from(table)
      .where(afterTimeIdCursor(table.occurredAt, table.id, cursor, order))
      .toSQL();

  it("newest first by default: an older instant, or the same one with a smaller id", () => {
    const query = render();

    expect(query.sql).toContain(
      `where ("outbox_event"."occurred_at" < $1 or ("outbox_event"."occurred_at" = $2 and "outbox_event"."id" < $3))`,
    );
    expect(query.params).toEqual([cursor.at, cursor.at, cursor.id]);
  });

  it("oldest first: a later instant, or the same one with a greater id", () => {
    const query = render("asc");

    expect(query.sql).toContain(
      `where ("outbox_event"."occurred_at" > $1 or ("outbox_event"."occurred_at" = $2 and "outbox_event"."id" > $3))`,
    );
    expect(query.params).toEqual([cursor.at, cursor.at, cursor.id]);
  });
});

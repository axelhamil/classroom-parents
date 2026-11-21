import { describe, expect, it } from "vitest";
import { CHILD } from "../../../__tests__/family-fixtures";
import { HUGO } from "../../../__tests__/week-fixtures";
import { schoolClock } from "../../../shared/agenda/school-clock";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { blockIsEmpty, emptyBlockIds } from "../block-emptiness";

const clock = schoolClock(new Date("2026-11-12T08:00:00.000Z"));

const LEA = { ...CHILD, color: 1, status: "connected" } satisfies ChildDto;

const HUGO_CHILD = { ...HUGO, color: 2, status: "connected" } satisfies ChildDto;

const LEA_BLOCK = `child:${LEA.id}`;

function event(deadlineDate: string, overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: `event-${deadlineDate}`,
    childId: CHILD.id,
    course: null,
    title: "Devoir",
    description: "",
    category: "homework",
    deadlineDate,
    deadlineAt: `${deadlineDate}T22:59:00.000Z`,
    status: "confirmed",
    reviewReasons: [],
    source: "announcement",
    done: false,
    receivedAt: "2026-11-01T08:00:00.000Z",
    edited: false,
    editedFields: [],
    checklist: { done: [], removed: [], extra: [] },
    ...overrides,
  } satisfies EventItem;
}

const LATE = event("2026-11-06");

const SHOWN_BY: Record<string, EventItem> = {
  review: event("2026-11-16", { status: "needs_review" }),
  overdue: LATE,
  assessments: event("2026-11-16", { category: "assessment" }),
  documents: event("2026-11-16", { category: "document_due" }),
  outings: event("2026-11-16", { category: "school_trip" }),
  workload: event("2026-11-16"),
  progress: event("2026-11-13"),
  [LEA_BLOCK]: event("2026-11-16"),
};

const LEFT_OUT_BY: Record<string, EventItem> = {
  review: event("2026-11-10", { status: "needs_review" }),
  overdue: event("2026-11-06", { done: true }),
  assessments: event("2026-11-16", { category: "homework" }),
  documents: event("2026-11-16", { category: "assessment" }),
  outings: event("2026-11-30", { category: "school_trip" }),
  workload: event("2026-11-16", { done: true }),
  progress: event("2026-11-13", { childId: HUGO.id }),
  [LEA_BLOCK]: event("2026-11-16", { childId: HUGO.id }),
};

describe("a home block is empty by one rule, shared by its tile and the advice", () => {
  it.each(Object.keys(SHOWN_BY))("given no deadline at all, then %s is empty", (id) => {
    expect(blockIsEmpty(id, { events: [], clock, childId: null })).toBe(true);
  });

  it.each(Object.entries(SHOWN_BY))(
    "given a deadline it shows, then %s is not empty",
    (id, shown) => {
      expect(blockIsEmpty(id, { events: [shown], clock, childId: null })).toBe(false);
    },
  );

  it.each(Object.entries(LEFT_OUT_BY))(
    "given only a deadline it leaves out for Léa, then %s is empty",
    (id, left) => {
      expect(blockIsEmpty(id, { events: [left], clock, childId: CHILD.id })).toBe(true);
    },
  );

  it("given a block that never runs dry, then it is never empty", () => {
    expect(blockIsEmpty("notes", { events: [], clock, childId: null })).toBe(false);
    expect(blockIsEmpty("today", { events: [], clock, childId: null })).toBe(false);
  });

  it("given a family with one late deadline, then every block it may advise but overdue is empty", () => {
    const empty = emptyBlockIds({
      events: [LATE],
      reviewEvents: [],
      family: [LEA, HUGO_CHILD],
      clock,
    });

    expect([...empty].sort()).toEqual(
      [
        "assessments",
        "documents",
        "outings",
        "progress",
        "review",
        "workload",
        LEA_BLOCK,
        `child:${HUGO.id}`,
      ].sort(),
    );
  });
});

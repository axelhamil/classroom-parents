import { daysFrom, isWeekday, shiftDate } from "@packages/ddd-kit/days";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EventItem } from "../../api/queries/events";
import { courseShortener } from "../../format/course-name";
import {
  type AgendaDay,
  agendaDaysView,
  isCrunchDay,
  periodSummaryView,
  quietRuns,
  upcomingWeeks,
} from "../calendar-days";
import { agendaArb } from "./agenda-arbitraries";

const THURSDAY = { today: "2026-11-19" };
const ALL = { childId: null, courseId: null };
const RUNS = { numRuns: 300 };

let sequence = 0;

function deadline(deadlineDate: string, overrides: Partial<EventItem> = {}): EventItem {
  sequence += 1;

  return {
    id: `event-${sequence}`,
    childId: "jade",
    course: { id: "maths", name: "Mathématiques 4e B" },
    title: `Échéance ${sequence}`,
    description: "",
    category: "homework",
    deadlineDate,
    deadlineTime: undefined,
    deadlineAt: `${deadlineDate}T23:59:00.000Z`,
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

const week = (from: string) => daysFrom(from, 7);

const shapeOf = (days: readonly AgendaDay[]) =>
  quietRuns(days).map((run) => (run.kind === "day" ? run.day.date : `${run.from}..${run.to}`));

describe("the days of the agenda", () => {
  it("given a week, when the agenda reads it, then each day knows its tone, its distance and its counts", () => {
    const events = [
      deadline("2026-11-20", { category: "assessment" }),
      deadline("2026-11-20"),
      deadline("2026-11-18", { done: true }),
    ];

    const days = agendaDaysView(week("2026-11-16"), events, THURSDAY, ALL);

    expect(days.map((day) => day.tone)).toEqual([
      "past",
      "past",
      "past",
      "today",
      "default",
      "default",
      "default",
    ]);
    expect(days[4]).toMatchObject({ offset: 1, summary: { count: 2, assessments: 1 } });
    expect(periodSummaryView(days)).toEqual({ count: 3, assessments: 1 });
  });

  it("given a filter on a child and a course, when the agenda reads the week, then only their deadlines count", () => {
    const events = [
      deadline("2026-11-20"),
      deadline("2026-11-20", { childId: "leo" }),
      deadline("2026-11-20", { course: { id: "svt", name: "SVT 4e B" } }),
      deadline("2026-11-20", { course: null }),
    ];

    const days = agendaDaysView(week("2026-11-16"), events, THURSDAY, {
      childId: "jade",
      courseId: "maths",
    });

    expect(periodSummaryView(days).count).toBe(1);
  });

  it("given three open deadlines, when the day is today or ahead, then it is loaded, and a done one does not count", () => {
    const open = { done: false };

    expect(isCrunchDay("2026-11-20", [open, open, open], THURSDAY.today)).toBe(true);
    expect(isCrunchDay("2026-11-20", [open, open, { done: true }], THURSDAY.today)).toBe(false);
    expect(isCrunchDay("2026-11-18", [open, open, open], THURSDAY.today)).toBe(false);
  });
});

describe("the thread folds its empty days", () => {
  it("given empty days around a full Friday, when they fold, then the fold stops at today and at the weekend", () => {
    const days = agendaDaysView(week("2026-11-16"), [deadline("2026-11-20")], THURSDAY, ALL);

    expect(shapeOf(days)).toEqual([
      "2026-11-16..2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21..2026-11-22",
    ]);
  });

  it("given a week across two months with nothing due, when it folds, then the weekdays and the weekend stay apart", () => {
    const days = agendaDaysView(week("2026-11-30"), [], { today: "2026-11-01" }, ALL);

    expect(shapeOf(days)).toEqual(["2026-11-30..2026-12-04", "2026-12-05..2026-12-06"]);
  });

  it("whatever the agenda, every day appears once and in order, and no fold holds today or mixes weekend and weekdays", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events, childId }) => {
        const days = agendaDaysView(daysFrom(shiftDate(clock.today, -10), 21), events, clock, {
          childId,
          courseId: null,
        });
        const runs = quietRuns(days);
        const covered = runs.flatMap((run) => (run.kind === "day" ? [run.day] : run.days));

        expect(covered.map((day) => day.date)).toEqual(days.map((day) => day.date));
        for (const run of runs) {
          if (run.kind === "day") continue;

          expect(run.days.every((day) => day.deadlines.length === 0)).toBe(true);
          expect(run.days.some((day) => day.tone === "today")).toBe(false);
          expect(new Set(run.days.map((day) => isWeekday(day.date))).size).toBe(1);
        }
        expect(periodSummaryView(days).count).toBe(
          days.reduce((sum, day) => sum + day.summary.count, 0),
        );
      }),
      RUNS,
    );
  });
});

describe("the weeks of À venir", () => {
  it("given a Thursday, when the list opens, then its weeks run Monday to Sunday from this week on", () => {
    expect(upcomingWeeks(THURSDAY, 2)).toEqual([
      { from: "2026-11-16", to: "2026-11-22" },
      { from: "2026-11-23", to: "2026-11-29" },
    ]);
  });
});

describe("the short course name", () => {
  it.each([
    [
      "drops the class every course of the child ends with",
      ["Mathématiques 4e B", "Histoire-Géographie 4e B"],
      "Mathématiques 4e B",
      "Mathématiques",
    ],
    ["keeps a name with no shared ending", ["Mathématiques", "SVT 4e B"], "SVT 4e B", "SVT 4e B"],
    [
      "keeps the only course whole",
      ["Mathématiques 4e B"],
      "Mathématiques 4e B",
      "Mathématiques 4e B",
    ],
    ["keeps a name that is only the class", ["4e B", "SVT 4e B"], "4e B", "4e B"],
    [
      "keeps a name of another class whole",
      ["Maths 4e B", "SVT 4e B"],
      "Anglais 3e A",
      "Anglais 3e A",
    ],
    ["ignores empty names", ["", "Maths 4e B", "SVT 4e B"], "SVT 4e B", "SVT"],
  ])("%s", (_, siblings, name, expected) => {
    expect(courseShortener(siblings)(name)).toBe(expected);
  });
});

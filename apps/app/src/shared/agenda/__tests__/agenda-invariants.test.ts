import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hasOpenSteps, hasOpenStepsToPrepare } from "../checklist-template";
import { isDueWithin, isOpen, isOverdue, needsReview } from "../deadline-facts";
import { isSchoolDay } from "../school-clock";
import { dayPlanView, nextAfterFocus, overdueView, reviewView, tonightView } from "../views";
import { RELATIVE_HORIZON_DAYS, whenOf } from "../when";
import { lateWindow, nextSevenDays } from "../windows";
import { agendaArb, clockArb } from "./agenda-arbitraries";

const RUNS = { numRuns: 400 };

const idsOf = (events: readonly { id: string }[]) => events.map((event) => event.id).sort();

describe("the school clock", () => {
  it("looks at a school day, today or later, and prepares tonight a school day after today", () => {
    fc.assert(
      fc.property(clockArb, (clock) => {
        expect(clock.focus >= clock.today).toBe(true);
        expect(isSchoolDay(clock.focus, clock.closedDays)).toBe(true);
        expect(clock.tonightFor > clock.today).toBe(true);
        expect(isSchoolDay(clock.tonightFor, clock.closedDays)).toBe(true);
      }),
      RUNS,
    );
  });

  it("greets the evening exactly when the home has turned to the next school day on a school day", () => {
    fc.assert(
      fc.property(clockArb, (clock) => {
        if (!isSchoolDay(clock.today, clock.closedDays)) return;

        expect(clock.greeting === "evening").toBe(clock.focus !== clock.today);
      }),
      RUNS,
    );
  });
});

describe("tonight and the next school day", () => {
  it("prepare the same day once the school day is over (2)", () => {
    fc.assert(
      fc.property(clockArb, (clock) => {
        if (clock.focus === clock.today) return;

        expect(clock.tonightFor).toBe(clock.focus);
      }),
      RUNS,
    );
  });

  it("never say 'nothing to prepare' for a day the briefing counts open steps for (1)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events, childId }) => {
        const plan = dayPlanView(events, clock, { childId });
        const tonight = tonightView(events, clock, childId);
        if (plan.day !== tonight.day) return;

        expect(idsOf(tonight.toPrepare)).toEqual(idsOf(plan.toPrepare));
        expect(idsOf(tonight.suggested)).toEqual(idsOf(plan.suggested));
      }),
      RUNS,
    );
  });

  it("put what the announcement asks to prepare, and template steps apart, never both nor neither", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events, childId }) => {
        const tonight = tonightView(events, clock, childId);
        const withSteps = tonight.open.filter(hasOpenSteps);

        expect(idsOf([...tonight.toPrepare, ...tonight.suggested])).toEqual(idsOf(withSteps));
        for (const event of tonight.open)
          if (hasOpenStepsToPrepare(event)) expect(tonight.toPrepare).toContain(event);
      }),
      RUNS,
    );
  });
});

describe("the briefing count", () => {
  it("only counts deadlines up to the day it names, today's leftovers apart (4)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events, childId }) => {
        const plan = dayPlanView(events, clock, { childId });
        const dayIsOver = clock.focus !== clock.today;

        for (const event of plan.deadlines) {
          expect(event.deadlineDate <= clock.focus).toBe(true);
          expect(
            dayIsOver ? event.deadlineDate > clock.today : event.deadlineDate === clock.today,
          ).toBe(true);
        }
        for (const event of plan.leftToday) expect(event.deadlineDate).toBe(clock.today);
        expect(plan.leftToday.some((event) => plan.deadlines.includes(event))).toBe(false);
      }),
      RUNS,
    );
  });
});

describe("late deadlines", () => {
  it("are every open deadline of the late window, latest first (5)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events, childId }) => {
        const late = overdueView(events, clock, childId);
        const range = lateWindow.range(clock);
        const expected = events.filter(
          (event) =>
            (childId === null || event.childId === childId) &&
            isDueWithin(event, range) &&
            isOverdue(event, clock.today),
        );

        expect(idsOf(late)).toEqual(idsOf(expected));
        const instants = late.map((event) => event.deadlineAt);
        expect(instants).toEqual([...instants].sort().reverse());
      }),
      RUNS,
    );
  });
});

describe("dates to check", () => {
  it("split into coming and past, none lost, none twice (6)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events }) => {
        const { upcoming, past } = reviewView(events, clock);
        const toCheck = events.filter((event) => isOpen(event) && needsReview(event));

        expect(idsOf([...upcoming, ...past])).toEqual(idsOf(toCheck));
      }),
      RUNS,
    );
  });
});

describe("when a deadline falls", () => {
  it("reads the same for the same clock wherever it is written (7)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events }) => {
        for (const event of events) {
          const once = whenOf(event, clock, { dated: true });
          const twice = whenOf({ ...event }, { ...clock }, { dated: true });

          expect(twice).toEqual(once);
        }
      }),
      RUNS,
    );
  });

  it("writes its day once: the urgent word or the date, never both, and only counts days within the horizon (7, 8)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events }) => {
        for (const event of events) {
          const dated = whenOf(event, clock, { dated: true });
          const undated = whenOf(event, clock, { dated: false });

          expect(dated.date !== null && dated.badge?.tone === "urgent").toBe(false);
          expect(dated.badge?.kind === "inDays").toBe(false);
          expect(undated.date).toBeNull();
          expect(undated.badge?.kind === "today" || undated.badge?.kind === "tomorrow").toBe(false);
          if (undated.badge?.kind === "inDays") {
            expect(undated.badge.days).toBeGreaterThanOrEqual(2);
            expect(undated.badge.days).toBeLessThanOrEqual(RELATIVE_HORIZON_DAYS);
          }
          expect(dated.time).toBe(event.deadlineTime ?? null);
        }
      }),
      RUNS,
    );
  });

  it("never counts down a deadline already ticked or past", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events }) => {
        for (const event of events) {
          const { badge } = whenOf(event, clock, { dated: false });
          if (event.done || event.deadlineDate < clock.today) expect(badge).toBeNull();
        }
      }),
      RUNS,
    );
  });
});

describe("the next deadline of an empty day", () => {
  it("is never later than the first open deadline the week shows after the day (9)", () => {
    fc.assert(
      fc.property(agendaArb, ({ clock, events, childId }) => {
        const next = nextAfterFocus(events, clock, childId);
        const week = nextSevenDays.range(clock);
        const shown = events.filter(
          (event) =>
            (childId === null || event.childId === childId) &&
            isOpen(event) &&
            isDueWithin(event, week) &&
            event.deadlineDate > clock.focus,
        );
        if (shown.length === 0) return;

        const first = shown.map((event) => event.deadlineDate).sort()[0] ?? "";
        expect((next?.deadlineDate ?? "") <= first).toBe(true);
        expect(next).not.toBeNull();
      }),
      RUNS,
    );
  });
});

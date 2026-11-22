import { mondayOf, shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isSchoolDay, schoolClock } from "../school-clock";
import { countByChild, heroAgendaOpensOn, weekHeroDay } from "../views";
import { agendaArb, clockArb } from "./agenda-arbitraries";

const WHIT_MONDAY = "2026-05-25";

function clockWith(at: string, closedDays: readonly string[] = []) {
  return schoolClock(new Date(at), { timeZone: PARIS_TIME_ZONE, closedDays: new Set(closedDays) });
}

describe("the day the week's hero shows", () => {
  it.each([
    {
      given: "holidays ending on a Friday",
      clock: clockWith("2026-02-18T09:00:00Z"),
      endsOn: "2026-02-20",
      day: "2026-02-23",
    },
    {
      given: "holidays ending on the eve of a bank holiday",
      clock: clockWith("2026-05-20T09:00:00Z", [WHIT_MONDAY]),
      endsOn: "2026-05-24",
      day: "2026-05-26",
    },
  ])("given $given, then it is the first school day after them", ({ clock, endsOn, day }) => {
    expect(weekHeroDay(clock, endsOn)).toBe(day);
  });

  it("given any clock and holidays ending on any day, then it is a school day after their end", () => {
    fc.assert(
      fc.property(clockArb, fc.integer({ min: -10, max: 40 }), (clock, offset) => {
        const end = shiftDate(clock.today, offset);
        const day = weekHeroDay(clock, end);

        expect(day > end).toBe(true);
        expect(isSchoolDay(day, clock.closedDays)).toBe(true);
      }),
    );
  });

  it("given no holidays, then it is the Monday of the week the home looks at", () => {
    fc.assert(
      fc.property(clockArb, (clock) => {
        expect(weekHeroDay(clock, null)).toBe(mondayOf(clock.focus));
      }),
    );
  });
});

describe("the deadlines counted per child", () => {
  it("given any family and deadlines, then each child counts its own and nothing is lost", () => {
    fc.assert(
      fc.property(agendaArb, ({ family, events }) => {
        const children = family.map((id) => ({ id, label: id }));
        const counts = countByChild(events, children);

        expect(counts.map(({ label }) => label)).toEqual(family);
        expect(counts.reduce((total, { count }) => total + count, 0)).toBe(events.length);
        for (const { label, count } of counts)
          expect(count).toBe(events.filter((event) => event.childId === label).length);
      }),
    );
  });
});

describe("the day the hero Agenda opens on", () => {
  it("given holidays, then it is the day school starts again, the one its date shows", () => {
    fc.assert(
      fc.property(clockArb, fc.integer({ min: 0, max: 20 }), (clock, offset) => {
        const end = shiftDate(clock.today, offset);

        expect(heroAgendaOpensOn(clock, end)).toBe(weekHeroDay(clock, end));
      }),
    );
  });

  it("given no holidays, then it opens where the Agenda always does", () => {
    expect(heroAgendaOpensOn(clockWith("2026-11-19T08:00:00Z"), null)).toBeUndefined();
  });
});

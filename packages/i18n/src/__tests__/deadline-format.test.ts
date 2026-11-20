import { describe, expect, it } from "vitest";
import {
  datedDeadlineLabel,
  deadlineLine,
  relativeDayLabel,
  wallDateLabel,
  wallTimeLabel,
  withWallTime,
} from "../deadline-format";

const TODAY = "2030-01-15";

describe("wallTimeLabel", () => {
  it("given a time on the hour, then the minutes are dropped", () => {
    expect(wallTimeLabel("18:00")).toBe("18 h");
  });
});

describe("withWallTime", () => {
  it("given a deadline with a time, then the date and the French time read as on screen", () => {
    expect(withWallTime(wallDateLabel("2030-01-17", TODAY), "08:30")).toBe(
      "jeudi 17 janvier, 8 h 30",
    );
  });
});

describe("relativeDayLabel", () => {
  it("given the date of today, then it reads today", () => {
    expect(relativeDayLabel(TODAY, TODAY)).toBe("Aujourd'hui");
  });

  it("given the next date, then it reads tomorrow", () => {
    expect(relativeDayLabel("2030-01-16", TODAY)).toBe("Demain");
  });

  it("given a later date of the same year, then it reads the weekday and the date without the year", () => {
    expect(relativeDayLabel("2030-01-17", TODAY)).toBe("Jeudi 17 janvier");
  });

  it("given a past date, then it reads the date, never a relative word", () => {
    expect(relativeDayLabel("2030-01-14", TODAY)).toBe("Lundi 14 janvier");
  });

  it("given tomorrow across the new year, then it still reads tomorrow", () => {
    expect(relativeDayLabel("2031-01-01", "2030-12-31")).toBe("Demain");
  });

  it("given a later date in the next year, then the year is spelled out", () => {
    expect(relativeDayLabel("2031-01-05", "2030-12-30")).toBe("Dimanche 5 janvier 2031");
  });
});

describe("datedDeadlineLabel", () => {
  it("given today, then the relative day is followed by its date and time", () => {
    expect(datedDeadlineLabel({ date: TODAY, time: "08:30", today: TODAY })).toBe(
      "aujourd'hui, mardi 15 janvier, 8 h 30",
    );
  });

  it("given tomorrow, then the relative day is followed by its date", () => {
    expect(datedDeadlineLabel({ date: "2030-01-16", today: TODAY })).toBe(
      "demain, mercredi 16 janvier",
    );
  });

  it("given another day, then the date is written once", () => {
    expect(datedDeadlineLabel({ date: "2030-01-17", time: "18:00", today: TODAY })).toBe(
      "jeudi 17 janvier, 18 h",
    );
  });

  it("given tomorrow in the next year, then the date carries its year", () => {
    expect(datedDeadlineLabel({ date: "2031-01-01", today: "2030-12-31" })).toBe(
      "demain, mercredi 1 janvier 2031",
    );
  });

  it("given a dated line, then the line closes with the relative day and its date", () => {
    expect(
      deadlineLine({
        child: "Léa",
        title: "Exposé",
        when: { date: "2030-01-16", time: "08:30", today: TODAY },
        dated: true,
      }),
    ).toBe("Léa : Exposé, demain, mercredi 16 janvier, 8 h 30");
  });
});

describe("deadlineLine", () => {
  it("given a child and a title, then the child comes first", () => {
    expect(deadlineLine({ child: "Léa", title: "Exposé" })).toBe("Léa : Exposé");
  });

  it("given no child label, then the title stands alone", () => {
    expect(deadlineLine({ child: "", title: "Exposé" })).toBe("Exposé");
  });

  it("given when it falls, then the relative day and the time close the line in a sentence", () => {
    expect(
      deadlineLine({
        child: "Léa",
        title: "Exposé",
        when: { date: "2030-01-16", time: "08:30", today: TODAY },
      }),
    ).toBe("Léa : Exposé, demain, 8 h 30");
  });
});

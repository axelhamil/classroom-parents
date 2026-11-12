import { describe, expect, it } from "vitest";
import { relativeDayLabel, sampleDay, schoolToday } from "../components/sample-week";

const COPY = { tomorrow: "Demain", dateWithTime: "{{date}}, {{time}}" };

describe("the sample week", () => {
  it("dates the sample from the Paris school day, not the server clock", () => {
    expect(schoolToday(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
  });

  it("names the next day tomorrow", () => {
    const day = sampleDay("2026-11-12", 1, "08:30", COPY);

    expect(day.label).toBe("Demain, 08:30");
    expect(day.date).toBe("2026-11-13");
  });

  it("spells a later day as a capitalized long date", () => {
    expect(sampleDay("2026-11-12", 3, "13:45", COPY).label).toBe("Dimanche 15 novembre, 13:45");
  });

  it("crosses a month end", () => {
    const day = sampleDay("2026-11-28", 5, "08:30", COPY);

    expect(day.date).toBe("2026-12-03");
    expect(day.label).toBe("Jeudi 3 décembre, 08:30");
  });

  it("labels the served sample relative to any reading day", () => {
    expect(relativeDayLabel(1, "08:30", COPY)).toBe("Demain, 08:30");
    expect(relativeDayLabel(3, "13:45", COPY)).toBe("13:45");
  });
});

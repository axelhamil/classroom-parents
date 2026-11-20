import { describe, expect, it } from "vitest";
import { deadlineLabel, instantLabel } from "../deadline-label";

const TODAY = "2026-11-09";

describe("deadlineLabel", () => {
  it("given a later deadline with a time, then it reads the weekday, the date and the French time", () => {
    expect(deadlineLabel("2026-11-19", "08:30", TODAY)).toBe("Jeudi 19 novembre, 8 h 30");
  });
});

describe("instantLabel", () => {
  it("given a send instant in UTC, then it reads the wall time of the clock's zone, summer offset included", () => {
    expect(
      instantLabel("2027-03-28T16:00:00.000Z", { today: TODAY, timeZone: "Europe/Paris" }),
    ).toBe("Dimanche 28 mars 2027, 18 h");
    expect(
      instantLabel("2027-03-28T16:00:00.000Z", { today: TODAY, timeZone: "America/Montreal" }),
    ).toBe("Dimanche 28 mars 2027, 12 h");
  });
});

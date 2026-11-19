import { describe, expect, it } from "vitest";
import { deadlineLabel, instantLabel } from "../deadline-label";

const NOW = new Date("2026-11-09T09:00:00Z");

describe("deadlineLabel", () => {
  it("given a deadline on the Paris date of now and no time, then it reads today", () => {
    expect(deadlineLabel("2026-11-09", undefined, NOW)).toBe("Aujourd'hui");
  });

  it("given a deadline on the next Paris date, then it reads tomorrow", () => {
    expect(deadlineLabel("2026-11-10", undefined, NOW)).toBe("Demain");
  });

  it("given a later deadline with a time, then it reads the weekday, the date and the French time", () => {
    expect(deadlineLabel("2026-11-19", "08:30", NOW)).toBe("Jeudi 19 novembre, 8 h 30");
  });

  it("given today late at night in UTC but already tomorrow in Paris, then tomorrow follows Paris", () => {
    expect(deadlineLabel("2026-11-10", undefined, new Date("2026-11-09T23:30:00Z"))).toBe(
      "Aujourd'hui",
    );
  });

  it("given a deadline in another year, then the year is spelled out", () => {
    expect(deadlineLabel("2027-01-05", undefined, NOW)).toBe("Mardi 5 janvier 2027");
  });
});

describe("instantLabel", () => {
  it("given a send instant in UTC, then it reads the Paris wall time, summer offset included", () => {
    expect(instantLabel("2027-03-28T16:00:00.000Z", NOW)).toBe("Dimanche 28 mars 2027, 18 h");
  });
});

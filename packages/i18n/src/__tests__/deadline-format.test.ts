import { describe, expect, it } from "vitest";
import { wallDateLabel, wallTimeLabel, withWallTime } from "../deadline-format";

describe("wallTimeLabel", () => {
  it("given a time on the hour, then the minutes are dropped", () => {
    expect(wallTimeLabel("18:00")).toBe("18 h");
  });
});

describe("withWallTime", () => {
  it("given a deadline with a time, then the date and the French time read as on screen", () => {
    expect(withWallTime(wallDateLabel("2030-01-17", "2030-01-15"), "08:30")).toBe(
      "jeudi 17 janvier, 8 h 30",
    );
  });

  it("given a deadline in another year than today, then the year is spelled out", () => {
    expect(withWallTime(wallDateLabel("2031-01-05", "2030-12-30"), undefined)).toBe(
      "dimanche 5 janvier 2031",
    );
  });
});

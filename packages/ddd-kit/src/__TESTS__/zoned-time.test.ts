import { describe, expect, it } from "vitest";
import { utcToZonedWall, zonedWallTimeToUtc } from "../index";

const PARIS = "Europe/Paris";

const CASES = [
  { label: "winter time", date: "2026-11-17", time: "18:00", utc: "2026-11-17T17:00:00.000Z" },
  {
    label: "eve of the spring change",
    date: "2027-03-27",
    time: "18:00",
    utc: "2027-03-27T17:00:00.000Z",
  },
  {
    label: "day of the spring change",
    date: "2027-03-28",
    time: "18:00",
    utc: "2027-03-28T16:00:00.000Z",
  },
  {
    label: "day of the autumn change",
    date: "2026-10-25",
    time: "18:00",
    utc: "2026-10-25T17:00:00.000Z",
  },
];

describe("zoned wall time", () => {
  it.each(CASES)("converts $label to the matching instant", ({ date, time, utc }) => {
    expect(zonedWallTimeToUtc(date, time, PARIS).toISOString()).toBe(utc);
  });

  it.each(CASES)("reads $label back as the same wall time", ({ date, time, utc }) => {
    expect(utcToZonedWall(new Date(utc), PARIS)).toEqual({ date, time });
  });

  it("moves a wall time skipped by the spring change forward by the gap", () => {
    expect(zonedWallTimeToUtc("2027-03-28", "02:30", PARIS).toISOString()).toBe(
      "2027-03-28T01:30:00.000Z",
    );
  });

  it("resolves a wall time repeated by the autumn change to its first occurrence", () => {
    expect(zonedWallTimeToUtc("2026-10-25", "02:30", PARIS).toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("reads midnight as 00:00, not 24:00", () => {
    expect(utcToZonedWall(new Date("2026-11-16T23:00:00.000Z"), PARIS)).toEqual({
      date: "2026-11-17",
      time: "00:00",
    });
  });
});

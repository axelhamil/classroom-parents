import { describe, expect, it } from "vitest";
import { utcToZonedWall, zonedWallTimeToUtc, zonedWallTimeToUtcShifted } from "../index";

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

function instantOf(date: string, time: string, timeZone = PARIS): string {
  return zonedWallTimeToUtc(date, time, timeZone).getValue().toISOString();
}

describe("zoned wall time", () => {
  it.each(CASES)("converts $label to the matching instant", ({ date, time, utc }) => {
    expect(instantOf(date, time)).toBe(utc);
  });

  it.each(CASES)("reads $label back as the same wall time", ({ date, time, utc }) => {
    expect(utcToZonedWall(new Date(utc), PARIS).getValue()).toEqual({ date, time });
  });

  it("rejects a wall time skipped by the spring change", () => {
    expect(zonedWallTimeToUtc("2027-03-28", "02:30", PARIS).getError()).toBe(
      "ZONED_TIME_NONEXISTENT_WALL_TIME",
    );
  });

  it("shifts a computed wall time skipped by the spring change to the first valid wall time", () => {
    expect(zonedWallTimeToUtcShifted("2027-03-28", "02:30", PARIS).getValue()).toEqual({
      at: new Date("2027-03-28T01:30:00.000Z"),
      wall: { date: "2027-03-28", time: "03:30" },
    });
  });

  it("keeps a computed wall time that exists as it is", () => {
    expect(zonedWallTimeToUtcShifted("2027-03-28", "18:00", PARIS).getValue()).toEqual({
      at: new Date("2027-03-28T16:00:00.000Z"),
      wall: { date: "2027-03-28", time: "18:00" },
    });
  });

  it("resolves a wall time repeated by the autumn change to its first occurrence", () => {
    expect(instantOf("2026-10-25", "02:30")).toBe("2026-10-25T00:30:00.000Z");
  });

  it("resolves the transitions of a zone more than 12 hours ahead of UTC", () => {
    expect(instantOf("2026-04-05", "03:00", "Pacific/Chatham")).toBe("2026-04-04T13:15:00.000Z");
    expect(
      zonedWallTimeToUtcShifted("2026-09-27", "02:50", "Pacific/Chatham").getValue().at,
    ).toEqual(new Date("2026-09-26T14:05:00.000Z"));
  });

  it("reads midnight as 00:00, not 24:00", () => {
    expect(utcToZonedWall(new Date("2026-11-16T23:00:00.000Z"), PARIS).getValue()).toEqual({
      date: "2026-11-17",
      time: "00:00",
    });
  });

  it.each([
    ["a day the month does not have", "2026-02-30", "18:00"],
    ["a thirteenth month", "2026-13-01", "18:00"],
    ["an hour past 23", "2026-11-17", "25:00"],
    ["a minute past 59", "2026-11-17", "18:60"],
    ["seconds", "2026-11-17", "18:00:30"],
    ["a bare hour", "2026-11-17", "18"],
    ["an empty date", "", "18:00"],
  ])("rejects %s instead of shifting the instant", (_label, date, time) => {
    expect(zonedWallTimeToUtc(date, time, PARIS).getError()).toBe("ZONED_TIME_INVALID_WALL_TIME");
  });

  it("rejects an unknown time zone in both directions", () => {
    expect(zonedWallTimeToUtc("2026-11-17", "18:00", "Mars/Olympus").getError()).toBe(
      "ZONED_TIME_INVALID_TIME_ZONE",
    );
    expect(utcToZonedWall(new Date(), "Mars/Olympus").getError()).toBe(
      "ZONED_TIME_INVALID_TIME_ZONE",
    );
  });

  it("rejects an invalid instant instead of throwing", () => {
    expect(utcToZonedWall(new Date(Number.NaN), PARIS).getError()).toBe(
      "ZONED_TIME_INVALID_INSTANT",
    );
  });
});

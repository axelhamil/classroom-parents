import { describe, expect, it } from "bun:test";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import { CalendarRange } from "../domain/value-objects/calendar-range.vo";

const bounds = (from: string, to: string, timeZone = PARIS_TIME_ZONE) =>
  CalendarRange.between(from, to, timeZone).map(({ value }) => [
    value.startsAt.toISOString(),
    value.endsBefore.toISOString(),
  ]);

describe("calendar range", () => {
  it("given one day in winter, then it runs from Paris midnight to the next Paris midnight", () => {
    expect(bounds("2026-11-19", "2026-11-19").getValue()).toEqual([
      "2026-11-18T23:00:00.000Z",
      "2026-11-19T23:00:00.000Z",
    ]);
  });

  it("given a month crossing the spring DST change, then its end follows summer time", () => {
    expect(bounds("2027-03-01", "2027-03-31").getValue()).toEqual([
      "2027-02-28T23:00:00.000Z",
      "2027-03-31T22:00:00.000Z",
    ]);
  });

  it("given a parent in Montreal, then the day runs between two Montreal midnights", () => {
    expect(bounds("2026-11-26", "2026-11-26", "America/Toronto").getValue()).toEqual([
      "2026-11-26T05:00:00.000Z",
      "2026-11-27T05:00:00.000Z",
    ]);
  });

  it("given a parent in Casablanca, then the day runs between two Casablanca midnights", () => {
    expect(bounds("2026-11-26", "2026-11-26", "Africa/Casablanca").getValue()).toEqual([
      "2026-11-25T23:00:00.000Z",
      "2026-11-26T23:00:00.000Z",
    ]);
  });

  it("given an unknown time zone, then it is refused", () => {
    expect(bounds("2026-11-26", "2026-11-26", "Mars/Olympus").isFailure).toBe(true);
  });

  it("given 62 days, then it is accepted", () => {
    expect(CalendarRange.between("2026-11-01", "2027-01-01", PARIS_TIME_ZONE).isSuccess).toBe(true);
  });

  it.each([
    ["63 days", "2026-11-01", "2027-01-02"],
    ["an end before the start", "2026-11-19", "2026-11-18"],
    ["a date that does not exist", "2026-02-27", "2026-02-30"],
    ["a date in another format", "19/11/2026", "2026-11-30"],
  ])("given %s, then it is refused", (_label, from, to) => {
    expect(CalendarRange.between(from, to, PARIS_TIME_ZONE).isFailure).toBe(true);
  });

  it("given bounds that are not the midnights of its dates, then it is refused", () => {
    const shifted = CalendarRange.create({
      from: "2026-11-19",
      to: "2026-11-19",
      timeZone: PARIS_TIME_ZONE,
      startsAt: new Date("2026-11-18T00:00:00.000Z"),
      endsBefore: new Date("2026-11-19T23:00:00.000Z"),
    });

    expect(shifted.isFailure).toBe(true);
  });
});

import { describe, expect, it } from "bun:test";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import { EventDeadline } from "../domain/value-objects/event-deadline.vo";

const instantOf = (date: string, time?: string, timeZone = PARIS_TIME_ZONE) =>
  EventDeadline.fromWallTime(date, time, timeZone).map((deadline) =>
    deadline.value.at.toISOString(),
  );

describe("event deadline in the wall time of its zone", () => {
  it("given the day before the spring DST change and no time, then it falls at 23:59 winter time", () => {
    expect(instantOf("2027-03-27").getValue()).toBe("2027-03-27T22:59:00.000Z");
  });

  it("given the day of the spring DST change and no time, then it falls at 23:59 summer time", () => {
    expect(instantOf("2027-03-28").getValue()).toBe("2027-03-28T21:59:00.000Z");
  });

  it("given 08:30 on the day of the autumn DST change, then it is 08:30 winter time", () => {
    expect(instantOf("2026-10-25", "08:30").getValue()).toBe("2026-10-25T07:30:00.000Z");
  });

  it("given a date without time in Montreal, then it falls at 23:59 Montreal time", () => {
    expect(instantOf("2026-11-26", undefined, "America/Toronto").getValue()).toBe(
      "2026-11-27T04:59:00.000Z",
    );
  });

  it("given an instant that matches Paris but not its own zone, then it is refused", () => {
    const forged = EventDeadline.create({
      date: "2026-11-26",
      schoolTimeZone: "America/Toronto",
      at: new Date("2026-11-26T22:59:00.000Z"),
    });

    expect(forged.isFailure).toBe(true);
  });

  it("given a date that does not exist, then it is refused instead of rolling over", () => {
    expect(instantOf("2026-02-30").isFailure).toBe(true);
  });

  it("given an hour past 23:59, then it is refused", () => {
    expect(instantOf("2026-11-19", "24:00").isFailure).toBe(true);
  });

  it("given a stored instant that does not match its wall time, then it is refused", () => {
    const forged = EventDeadline.create({
      date: "2026-11-19",
      schoolTimeZone: PARIS_TIME_ZONE,
      at: new Date("2026-11-19T10:00:00.000Z"),
    });

    expect(forged.isFailure).toBe(true);
  });
});

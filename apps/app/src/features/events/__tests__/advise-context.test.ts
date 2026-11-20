import { describe, expect, it } from "vitest";
import { type AdviceFacts, adviseContext } from "../advise-context";

const CHRISTMAS = { startsOn: "2026-12-19", endsOn: "2027-01-03" };

function factsAt(at: string, overrides: Partial<AdviceFacts> = {}): AdviceFacts {
  return {
    now: new Date(at),
    childIds: ["jade", "leo"],
    deadlinesWithinWeek: 5,
    assessmentsWithinWeek: 1,
    firstSyncDone: true,
    holidays: [CHRISTMAS],
    ...overrides,
  };
}

describe("the moment of the advised home", () => {
  it.each([
    ["Thursday 08:00", "2026-11-19T08:00:00+01:00", "morning"],
    ["Thursday 13:59", "2026-11-19T13:59:00+01:00", "morning"],
    ["Thursday 14:00", "2026-11-19T14:00:00+01:00", "evening"],
    ["Friday 21:00", "2026-11-20T21:00:00+01:00", "evening"],
    ["Saturday 08:00", "2026-11-21T08:00:00+01:00", "week"],
    ["Saturday 21:00", "2026-11-21T21:00:00+01:00", "week"],
    ["Sunday 17:59", "2026-11-22T17:59:00+01:00", "week"],
    ["Sunday 18:00", "2026-11-22T18:00:00+01:00", "evening"],
    ["Monday 07:00", "2026-11-23T07:00:00+01:00", "morning"],
  ])("given %s in Paris, then the moment is %s", (_, at, moment) => {
    expect(adviseContext(factsAt(at)).moment).toBe(moment);
  });
});

describe("the number of children of the advised home", () => {
  it.each([
    [0, "1"],
    [1, "1"],
    [2, "2-3"],
    [3, "2-3"],
    [4, "4+"],
  ])("given %i linked children, then the count is %s", (count, children) => {
    const childIds = Array.from({ length: count }, (_, index) => `child-${index}`);

    expect(adviseContext(factsAt("2026-11-19T08:00:00+01:00", { childIds })).children).toBe(
      children,
    );
  });
});

describe("how much the week holds", () => {
  it.each([
    ["no child linked and nothing due", { childIds: [], deadlinesWithinWeek: 0 }, "welcome"],
    [
      "a first sync still running and nothing due",
      { firstSyncDone: false, deadlinesWithinWeek: 0 },
      "welcome",
    ],
    [
      "a first sync still running and a deadline",
      { firstSyncDone: false, deadlinesWithinWeek: 1, assessmentsWithinWeek: 0 },
      "calm",
    ],
    ["3 deadlines and no assessment", { deadlinesWithinWeek: 3, assessmentsWithinWeek: 0 }, "calm"],
    [
      "no deadline after the first sync",
      { deadlinesWithinWeek: 0, assessmentsWithinWeek: 0 },
      "calm",
    ],
    [
      "3 deadlines and 1 assessment",
      { deadlinesWithinWeek: 3, assessmentsWithinWeek: 1 },
      "normal",
    ],
    [
      "4 deadlines and no assessment",
      { deadlinesWithinWeek: 4, assessmentsWithinWeek: 0 },
      "normal",
    ],
    [
      "9 deadlines and 1 assessment",
      { deadlinesWithinWeek: 9, assessmentsWithinWeek: 1 },
      "normal",
    ],
    ["10 deadlines", { deadlinesWithinWeek: 10, assessmentsWithinWeek: 0 }, "busy"],
    ["2 assessments", { deadlinesWithinWeek: 2, assessmentsWithinWeek: 2 }, "busy"],
  ])("given %s, then the data is %s", (_, overrides, data) => {
    expect(adviseContext(factsAt("2026-11-19T08:00:00+01:00", overrides)).data).toBe(data);
  });
});

describe("the school holidays of the parent's zone", () => {
  it.each([
    ["the day before the holidays", "2026-12-18T10:00:00+01:00", "none"],
    ["the first day off", "2026-12-19T10:00:00+01:00", "during"],
    ["new year's day", "2027-01-01T10:00:00+01:00", "during"],
    ["2 days before school resumes, 17:59", "2027-01-02T17:59:00+01:00", "during"],
    ["2 days before school resumes, 18:00", "2027-01-02T18:00:00+01:00", "eve"],
    ["the last day off, in the morning", "2027-01-03T10:00:00+01:00", "during"],
    ["the last day off, in the evening", "2027-01-03T20:00:00+01:00", "eve"],
    ["the day school resumes", "2027-01-04T08:00:00+01:00", "none"],
  ])("given %s, then the holiday phase is %s", (_, at, holiday) => {
    expect(adviseContext(factsAt(at)).holiday).toBe(holiday);
  });
});

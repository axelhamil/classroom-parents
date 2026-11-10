import { describe, expect, it } from "bun:test";
import {
  DATASET_ANNOUNCEMENTS,
  DATASET_CHILDREN,
  DATASET_COURSES,
  DATASET_COURSEWORK,
  DATASET_TODAY,
} from "../../eval/classroom-dataset";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const courseIds = new Set(DATASET_COURSES.map((course) => course.id));

describe("classroom dataset", () => {
  it("covers 2 children, 5 to 6 courses and about 40 announcements with unique ids", () => {
    const ids = [...DATASET_ANNOUNCEMENTS, ...DATASET_COURSEWORK].map((item) => item.id);

    expect(DATASET_CHILDREN).toHaveLength(2);
    expect(DATASET_COURSES.length).toBeGreaterThanOrEqual(5);
    expect(DATASET_COURSES.length).toBeLessThanOrEqual(6);
    expect(DATASET_ANNOUNCEMENTS.length).toBeGreaterThanOrEqual(38);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("attaches every announcement and coursework to a known course", () => {
    const orphans = [...DATASET_ANNOUNCEMENTS, ...DATASET_COURSEWORK].filter(
      (item) => !courseIds.has(item.courseId),
    );

    expect(orphans).toEqual([]);
  });

  it("holds history and upcoming deadlines around today", () => {
    const deadlines = DATASET_ANNOUNCEMENTS.flatMap((item) => item.expected);

    expect(deadlines.some((event) => event.deadlineDate < DATASET_TODAY)).toBe(true);
    expect(deadlines.some((event) => event.deadlineDate > DATASET_TODAY)).toBe(true);
    expect(DATASET_ANNOUNCEMENTS.some((item) => item.expected.length === 0)).toBe(true);
    expect(DATASET_ANNOUNCEMENTS.some((item) => item.expected.length > 1)).toBe(true);
  });

  it("names the right weekday for every explicit date except the flagged mismatch", () => {
    const mismatches = DATASET_ANNOUNCEMENTS.filter((item) =>
      item.expected.some((event) => {
        const day = Number(event.deadlineDate.slice(8));
        const weekday = WEEKDAYS[new Date(`${event.deadlineDate}T12:00:00Z`).getUTCDay()];
        const named = item.text.match(new RegExp(`(${WEEKDAYS.join("|")}) ${day}(er)? `));

        return named !== null && named[1] !== weekday && !event.needsReview;
      }),
    );

    expect(mismatches.map((item) => item.id)).toEqual([]);
  });

  it("covers the coursework cases: time, date only, no date, turned in", () => {
    expect(DATASET_COURSEWORK.some((work) => work.due?.utcTime !== undefined)).toBe(true);
    expect(DATASET_COURSEWORK.some((work) => work.due && work.due.utcTime === undefined)).toBe(
      true,
    );
    expect(DATASET_COURSEWORK.some((work) => work.due === undefined)).toBe(true);
    expect(DATASET_COURSEWORK.some((work) => work.turnedIn)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { schoolToday } from "../school-today";

describe("schoolToday", () => {
  it("given half past midnight in Paris, then today is the Paris date, not the UTC one", () => {
    expect(schoolToday(new Date("2026-06-14T22:30:00Z"))).toBe("2026-06-15");
  });
});

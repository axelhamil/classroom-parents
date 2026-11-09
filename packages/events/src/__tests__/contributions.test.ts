import { describe, expect, it } from "vitest";
import { ALL_EVENT_TYPES } from "../event-types";
import { CONTRIBUTIONS } from "../registry";

const contributedNames = CONTRIBUTIONS.flatMap((contribution) => Object.keys(contribution.types));

describe("event contributions", () => {
  it("never declares the same event name in two contributions", () => {
    expect(new Set(contributedNames).size).toBe(contributedNames.length);
  });

  it("never reuses an event type string", () => {
    expect(new Set(ALL_EVENT_TYPES).size).toBe(ALL_EVENT_TYPES.length);
  });
});

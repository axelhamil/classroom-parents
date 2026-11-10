import {
  EVENT_CATEGORIES,
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
} from "@packages/events/agenda-contract";
import { describe, expect, it } from "vitest";
import { eventEditSchema } from "../events.schema";

const valid = {
  title: "Contrôle de maths",
  description: "",
  category: "assessment",
  deadlineDate: "2030-01-17",
  deadlineTime: "",
};

describe("eventEditSchema", () => {
  it("offers every category the agenda accepts", () => {
    for (const category of EVENT_CATEGORIES)
      expect(eventEditSchema.safeParse({ ...valid, category }).success).toBe(true);
  });

  it("stops the title and the description at the bounds the agenda enforces", () => {
    const parse = (title: string, description: string) =>
      eventEditSchema.safeParse({ ...valid, title, description }).success;

    expect(parse("a".repeat(EVENT_TITLE_MAX), "a".repeat(EVENT_DESCRIPTION_MAX))).toBe(true);
    expect(parse("a".repeat(EVENT_TITLE_MAX + 1), "")).toBe(false);
    expect(parse("Contrôle", "a".repeat(EVENT_DESCRIPTION_MAX + 1))).toBe(false);
  });
});

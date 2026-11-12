import { describe, expect, it } from "vitest";
import type { ChildDto } from "../../api/queries/children";
import { childHue } from "../child-hue";

function child(id: string): ChildDto {
  return {
    id,
    label: id,
    googleEmail: `${id}@example.com`,
    status: "connected",
    lastSyncedAt: "2026-11-09T08:00:00.000Z",
    syncing: false,
  };
}

const FAMILY = Array.from({ length: 10 }, (_, index) => child(`child-${index}`));

describe("childHue", () => {
  it("childHue is stable for the same order", () => {
    const first = FAMILY.map((member) => childHue(FAMILY, member.id));
    const second = [...FAMILY].map((member) => childHue([...FAMILY], member.id));

    expect(first).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2]);
    expect(second).toEqual(first);
  });

  it("gives an unknown child the first hue instead of failing", () => {
    expect(childHue(FAMILY, "gone")).toBe(1);
  });
});

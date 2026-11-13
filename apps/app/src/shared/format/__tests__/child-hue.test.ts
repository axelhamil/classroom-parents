import { describe, expect, it } from "vitest";
import type { ChildDto } from "../../api/queries/children";
import { childHue } from "../child-hue";

function child(id: string, color: ChildDto["color"]): ChildDto {
  return {
    id,
    label: id,
    color,
    avatarUrl: null,
    googleEmail: `${id}@example.com`,
    status: "connected",
    lastSyncedAt: "2026-11-09T08:00:00.000Z",
    syncing: false,
  };
}

describe("childHue", () => {
  it("draws each child in the color the family keeps for it, whatever its place in the list", () => {
    const family = [child("lea", 5), child("hugo", 2), child("ines", 8)];

    expect(family.map((member) => childHue(family, member.id))).toEqual([5, 2, 8]);
    expect(childHue([...family].reverse(), "lea")).toBe(5);
  });

  it("gives an unknown child the first hue instead of failing", () => {
    expect(childHue([child("lea", 5)], "gone")).toBe(1);
  });
});

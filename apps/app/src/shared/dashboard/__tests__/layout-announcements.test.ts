import { fixedT } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import {
  announceCanceled,
  announceDropped,
  announcePosition,
  announceSize,
} from "../layout-announcements";
import type { Draft } from "../layout-commands";

const DRAFT: Draft = [
  { id: "today", size: { w: 2, h: 2 } },
  { id: "calendar", size: { w: 4, h: 2 } },
  { id: "tonight", size: { w: 2, h: 1 } },
  { id: "review", size: { w: 1, h: 1 } },
];

const BOUNDS = { minW: 1, maxW: 3, minH: 1, maxH: 3 };

describe("layout announcements", () => {
  it("given a block in the draft, when announced, then its title, position, total and drawn size are read", async () => {
    const t = await fixedT("fr", "home");

    expect(announcePosition(t, DRAFT, "tonight", "Pour ce soir", { w: 2, h: 1 })).toBe(
      "Pour ce soir, position 3 sur 4, largeur 2, hauteur 1",
    );
    expect(announcePosition(t, DRAFT, "calendar", "Agenda", { w: 3, h: 2 })).toBe(
      "Agenda, position 2 sur 4, largeur 3, hauteur 2",
    );
  });

  it.each([
    ["widened", "w", { w: 3, h: 1 }, "Largeur 3 sur 3"],
    ["narrowed", "w", { w: 1, h: 1 }, "Largeur 1 sur 3"],
    ["grown", "h", { w: 2, h: 2 }, "Hauteur 2 sur 3"],
    ["shortened", "h", { w: 2, h: 1 }, "Hauteur 1 sur 3"],
  ] as const)(
    "given a block %s, when announced, then the side it changed is read against its largest",
    async (_, axis, size, said) => {
      const t = await fixedT("fr", "home");

      expect(announceSize(t, { axis, step: 1 }, size, BOUNDS, false)).toBe(said);
    },
  );

  it.each([
    [
      "widened at its widest",
      { axis: "w", step: 1 },
      { w: 3, h: 1 },
      "Largeur 3, la plus grande possible",
    ],
    [
      "narrowed at its narrowest",
      { axis: "w", step: -1 },
      { w: 1, h: 1 },
      "Largeur 1, la plus petite possible",
    ],
    [
      "grown at its highest",
      { axis: "h", step: 1 },
      { w: 2, h: 3 },
      "Hauteur 3, la plus grande possible",
    ],
    [
      "shortened at its lowest",
      { axis: "h", step: -1 },
      { w: 2, h: 1 },
      "Hauteur 1, la plus petite possible",
    ],
  ] as const)(
    "given a block %s, when announced, then the parent hears that a bound stops it",
    async (_, step, size, said) => {
      const t = await fixedT("fr", "home");

      expect(announceSize(t, step, size, BOUNDS, true)).toBe(said);
    },
  );

  it("given a block drawn past its bound to leave no hole, when announced, then the size drawn is read and why", async () => {
    const t = await fixedT("fr", "home");

    expect(announceSize(t, { axis: "w", step: 1 }, { w: 4, h: 1 }, BOUNDS, true)).toBe(
      "Largeur 4, agrandie pour ne laisser aucun vide",
    );
    expect(announceSize(t, { axis: "h", step: -1 }, { w: 2, h: 4 }, BOUNDS, false)).toBe(
      "Hauteur 4, agrandie pour ne laisser aucun vide",
    );
  });

  it("given a drop or a cancel, when announced, then the parent hears where the block stands", async () => {
    const t = await fixedT("fr", "home");

    expect(announceDropped(t)).toBe("Posé");
    expect(announceCanceled(t, DRAFT, "calendar")).toBe("Annulé, retour en position 2");
  });
});

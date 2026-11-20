import { fixedT } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import { announceCanceled, announceDropped, announcePosition } from "../layout-announcements";
import type { Draft } from "../layout-commands";

const DRAFT: Draft = [
  { id: "today", size: "l" },
  { id: "calendar", size: "xl" },
  { id: "tonight", size: "m" },
  { id: "review", size: "s" },
];

describe("layout announcements", () => {
  it("given a block in the draft, when announced, then its title, position, total and size are read", async () => {
    const t = await fixedT("fr", "home");

    expect(announcePosition(t, DRAFT, "tonight", "Pour ce soir")).toBe(
      "Pour ce soir, position 3 sur 4, taille moyenne",
    );
    expect(announcePosition(t, DRAFT, "calendar", "Agenda")).toBe(
      "Agenda, position 2 sur 4, taille très grande",
    );
  });

  it("given a drop or a cancel, when announced, then the parent hears where the block stands", async () => {
    const t = await fixedT("fr", "home");

    expect(announceDropped(t)).toBe("Posé");
    expect(announceCanceled(t, DRAFT, "calendar")).toBe("Annulé, retour en position 2");
  });
});

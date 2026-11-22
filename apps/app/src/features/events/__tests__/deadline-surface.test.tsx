// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { givenWideScreen } from "../../../__tests__/match-media";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";

const DOCUMENTS = [{ id: "documents", w: 2, h: 1 }];

function permission(childId: string, date = "2026-11-16") {
  return deadline(1, date, "Autorisation de sortie", { category: "document_due", childId });
}

async function cardSurface(): Promise<string | null> {
  const block = await screen.findByRole("region", { name: "À signer, à rendre" });
  const title = await within(block).findByText("Autorisation de sortie");

  return title.closest("[data-surface]")?.getAttribute("data-surface") ?? null;
}

describe("a deadline card of the home wears its child's color only when it tells children apart", () => {
  beforeEach(givenWideScreen);

  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given one child, then the card is on paper with the child's edge, like the agenda", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [permission(CHILD.id)], { homeLayout: DOCUMENTS });
    await renderAppAt("/");

    expect(await cardSurface()).toBe("paper");
  });

  it("given one child and a deadline due today, then its paper breathes the badge's amber, never a contour", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [permission(CHILD.id, "2026-11-12")], { homeLayout: DOCUMENTS });
    await renderAppAt("/");

    expect(await cardSurface()).toBe("urgent");
  });

  it("given two children, then the card takes its child's tint back", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD, HUGO], [permission(HUGO.id)], { homeLayout: DOCUMENTS });
    await renderAppAt("/");

    expect(await cardSurface()).toBe("tint");
  });
});

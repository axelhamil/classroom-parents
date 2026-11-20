// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";

const DOCUMENTS = [{ id: "documents", w: 4, h: 1, hidden: false }];

function permission(childId: string) {
  return deadline(1, "2026-11-16", "Autorisation de sortie", { category: "document_due", childId });
}

async function cardSurface(): Promise<string | null> {
  const block = await screen.findByRole("region", { name: "À signer, à rendre" });
  const title = await within(block).findByText("Autorisation de sortie");

  return title.closest("[data-surface]")?.getAttribute("data-surface") ?? null;
}

describe("a deadline card of the home wears its child's color only when it tells children apart", () => {
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

  it("given two children, then the card takes its child's tint back", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD, HUGO], [permission(HUGO.id)], { homeLayout: DOCUMENTS });
    await renderAppAt("/");

    expect(await cardSurface()).toBe("tint");
  });
});

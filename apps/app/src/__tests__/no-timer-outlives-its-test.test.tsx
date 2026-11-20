// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderAppAt, resetApp } from "./app-harness";
import { givenCalendar } from "./calendar-fixtures";
import { CHILD } from "./family-fixtures";
import { at, deadline } from "./week-fixtures";

const SONNER_EXIT_MS = 200;
const SCHEDULER_TURNS = 50;

// React finishes what the previous test's unmount left on its scheduler first: that work is not a
// timer, and it would hit the missing `window` too.
async function reactIdle(): Promise<void> {
  for (let turn = 0; turn < SCHEDULER_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function withoutWindow(during: number): Promise<void> {
  await reactIdle();
  const page = Reflect.get(globalThis, "window");
  Reflect.deleteProperty(globalThis, "window");

  try {
    await new Promise((resolve) => setTimeout(resolve, during));
  } finally {
    Reflect.set(globalThis, "window", page);
  }
}

describe("a timer started during a test", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given a confirmation undone from its toast, the toast starts leaving", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenCalendar(
      [CHILD],
      [deadline(1, "2026-11-19", "Sortie au musée", { status: "needs_review" })],
    );
    await renderAppAt("/");

    const block = await screen.findByRole("region", { name: "À vérifier" });
    fireEvent.click(
      await within(block).findByRole("button", { name: "C'est bon : Sortie au musée" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));

    expect(
      await within(block).findByRole("button", { name: "C'est bon : Sortie au musée" }),
    ).toBeDefined();
  });

  it("never fires once the page it ran on is gone, as when jsdom tears down after the last test", async () => {
    await withoutWindow(SONNER_EXIT_MS * 2);
  });
});

// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

function sharedTo(fields: Record<string, string>): string {
  return `/events/new?${new URLSearchParams(fields).toString()}`;
}

describe("sharing a teacher's message to the app", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given an e-mail shared as plain text, then its first line becomes the title and the rest the details", async () => {
    givenCalendar([CHILD], []);

    await renderAppAt(
      sharedTo({
        text: "Sortie au musée vendredi\nPrévoir un pique-nique.\nAutorisation à signer.",
      }),
    );

    expect(await screen.findByDisplayValue("Sortie au musée vendredi")).toBeDefined();
    expect(screen.getByLabelText("Description")).toHaveProperty(
      "value",
      "Prévoir un pique-nique.\nAutorisation à signer.",
    );
  });

  it("given a shared page with a title and a link, then the title is kept and the link lands in the details", async () => {
    givenCalendar([CHILD], []);

    await renderAppAt(
      sharedTo({
        title: "Réunion parents-profs",
        text: "Mardi 18 h",
        url: "https://ecole.example/r",
      }),
    );

    expect(await screen.findByDisplayValue("Réunion parents-profs")).toBeDefined();
    expect(screen.getByLabelText("Description")).toHaveProperty(
      "value",
      "Mardi 18 h\nhttps://ecole.example/r",
    );
  });
});

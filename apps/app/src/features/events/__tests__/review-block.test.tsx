// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type ApiCall, renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline } from "../../../__tests__/week-fixtures";

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";

function museum() {
  return deadline(1, "2026-11-19", "Sortie au musée", {
    status: "needs_review",
    reviewReasons: ["weekday_mismatch"],
    evidence: { quote: "Sortie au musée jeudi 18 novembre", before: "", after: "" },
  });
}

function pool() {
  return deadline(2, "2026-11-23", "Piscine", {
    status: "needs_review",
    reviewReasons: ["low_confidence"],
  });
}

const MUSEUM_ID = museum().id;

function reviewBlock(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "À vérifier" });
}

function confirmCalls(calls: readonly ApiCall[]): string[] {
  return calls
    .filter((call) => call.url.pathname.endsWith("/confirm"))
    .map((call) => `${call.method} ${call.url.pathname}${call.keepalive ? " keepalive" : ""}`);
}

const CONFIRMED = `POST /events/${MUSEUM_ID}/confirm keepalive`;
const UNCONFIRMED = `DELETE /events/${MUSEUM_ID}/confirm keepalive`;

async function confirmMuseum(): Promise<void> {
  const button = await within(await reviewBlock()).findByRole("button", {
    name: "C'est bon : Sortie au musée",
  });

  fireEvent.click(button);
}

describe("the block À vérifier", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  it("given dates to check, then each line names the child, the date read, why it is in doubt and the source passage", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [museum(), pool()]);
    await renderAppAt("/");

    const list = await within(await reviewBlock()).findByRole("region", {
      name: "Dates à vérifier",
    });
    const [line] = within(list).getAllByRole("listitem");
    expect(line?.textContent).toContain("Sortie au musée");
    expect(line?.textContent).toContain("Date lue : jeudi 19 novembre");
    expect(line?.textContent).toContain("Le jour de la semaine écrit ne tombe pas à cette date.");
    expect(line?.textContent).toContain("« Sortie au musée jeudi 18 novembre »");
    expect(line && within(line).getByRole("img", { name: CHILD.label })).toBeDefined();
    expect(within(await reviewBlock()).getByText("dates à vérifier")).toBeDefined();
  });

  it("given a date confirmed on its line, then the line leaves at once and the confirmation is sent right away", async () => {
    at(THURSDAY_MORNING);
    const stub = givenCalendar([CHILD], [museum(), pool()]);
    await renderAppAt("/");

    await confirmMuseum();

    const block = await reviewBlock();
    await waitFor(() =>
      expect(within(block).queryByRole("button", { name: /Sortie au musée/ })).toBeNull(),
    );
    expect(await screen.findByText("Sortie au musée : date confirmée")).toBeDefined();
    await waitFor(() => expect(confirmCalls(stub.calls)).toEqual([CONFIRMED]));
  });

  it("given the page closed right after C'est bon, then the confirmation is kept", async () => {
    at(THURSDAY_MORNING);
    const stub = givenCalendar([CHILD], [museum(), pool()]);
    await renderAppAt("/");

    await confirmMuseum();
    cleanup();

    await waitFor(() => expect(confirmCalls(stub.calls)).toEqual([CONFIRMED]));
    expect(stub.events.find((event) => event.id === MUSEUM_ID)?.status).toBe("confirmed");
  });

  it("given a confirmation undone from its toast, then the line comes back and the date goes back to review", async () => {
    at(THURSDAY_MORNING);
    const stub = givenCalendar([CHILD], [museum(), pool()]);
    await renderAppAt("/");

    await confirmMuseum();
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));

    expect(
      await within(await reviewBlock()).findByRole("button", {
        name: "C'est bon : Sortie au musée",
      }),
    ).toBeDefined();
    await waitFor(() => expect(confirmCalls(stub.calls)).toEqual([CONFIRMED, UNCONFIRMED]));
    expect(stub.events.find((event) => event.id === MUSEUM_ID)?.status).toBe("needs_review");
  });

  it("given a date to correct, then its line leads to the edit form of that date", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [museum()]);
    await renderAppAt("/");

    const fix = await within(await reviewBlock()).findByRole("link", {
      name: "Corriger : Sortie au musée",
    });

    expect(fix.getAttribute("href")).toBe(`/events/${MUSEUM_ID}/edit`);
  });

  it("given the last date confirmed, then the block says everything is checked and takes the focus", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [museum()]);
    await renderAppAt("/");

    await confirmMuseum();

    const allClear = await within(await reviewBlock()).findByText("Tout est vérifié");
    await waitFor(() => expect(document.activeElement).toBe(allClear.parentElement));
  });

  it("given the last date confirmed, then its undo stays offered until the parent leaves the home", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [museum()]);
    const router = await renderAppAt("/");

    await confirmMuseum();
    await within(await reviewBlock()).findByText("Tout est vérifié");
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDefined();

    void router.navigate({ to: "/history" });

    await waitFor(() => expect(screen.queryByRole("button", { name: "Annuler" })).toBeNull());
  });

  it("given nothing to check, then the block says so at its size instead of an empty card", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    expect(await within(await reviewBlock()).findByText("Tout est vérifié")).toBeDefined();
    expect(
      within(await reviewBlock()).getByText("Une date lue avec un doute arrivera ici."),
    ).toBeDefined();
    expect(within(await reviewBlock()).queryByRole("button")).toBeNull();
  });
});

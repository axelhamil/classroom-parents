// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiCall, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const EVENT = {
  id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90",
  childId: CHILD.id,
  title: "Contrôle de mathématiques sur les fractions",
  description: "Réviser le chapitre 3.",
  category: "assessment",
  deadlineDate: "2026-11-19",
  deadlineTime: "08:30",
  deadlineAt: "2026-11-19T07:30:00.000Z",
  status: "confirmed",
  source: "announcement",
  done: false,
  announcementUrl: "https://classroom.google.com/c/abc/p/def",
  receivedAt: "2026-11-05T10:00:00.000Z",
  edited: false,
  editedFields: [],
};

function givenFamily(children: unknown[], events: { status: string }[]): ApiCall[] {
  return stubApi(({ method, url }) => {
    if (url.pathname === "/children") return json(children);
    if (url.pathname === "/events" && method === "GET") {
      const status = url.searchParams.get("status");
      return json({ items: events.filter((event) => !status || event.status === status) });
    }
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

function eventListRequests(calls: ApiCall[]): URLSearchParams[] {
  return calls
    .filter((call) => call.method === "GET" && call.url.pathname === "/events")
    .map((call) => call.url.searchParams);
}

describe("upcoming events list", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the list, when the parent picks the swimming chip, then the url and the request both carry category=swimming", async () => {
    const calls = givenFamily([CHILD], [EVENT]);
    const router = await renderAppAt("/?tab=upcoming");
    await screen.findByText(EVENT.title);

    fireEvent.click(screen.getByRole("button", { name: "Piscine" }));

    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "upcoming", category: "swimming" }),
    );
    await waitFor(() =>
      expect(eventListRequests(calls).map((query) => query.get("category"))).toContain("swimming"),
    );
    expect(screen.getByRole("button", { name: "Piscine" })).toHaveProperty("ariaPressed", "true");
  });

  it("given an event to review, then the review card offers to confirm it or to edit it", async () => {
    givenFamily([CHILD], [{ ...EVENT, status: "needs_review" }]);
    await renderAppAt("/");

    const card = await screen.findByRole("heading", { level: 2, name: "À vérifier" });
    const region = card.closest("[data-slot=card]");

    expect(region?.textContent).toContain(EVENT.title);
    expect(screen.getByRole("button", { name: "C'est bon" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Modifier" }).getAttribute("href")).toBe(
      `/events/${EVENT.id}/edit`,
    );
  });

  it("given no event yet and a child whose first sync is running, then it says the analysis is in progress", async () => {
    givenFamily([{ ...CHILD, lastSyncedAt: undefined, syncing: true }], []);
    await renderAppAt("/");

    expect(await screen.findByText(/analyse en cours/)).toBeDefined();
  });

  it("given a child blocked by the school, then the list points the parent to the children screen", async () => {
    givenFamily([{ ...CHILD, status: "blocked_by_school", cause: "school_blocked" }], [EVENT]);
    await renderAppAt("/");

    const pointer = await screen.findByRole("link", { name: "Voir les enfants" });

    expect(pointer.getAttribute("href")).toBe("/children");
  });

  it("given an event to review beyond the loaded page, then the review card still lists it", async () => {
    const late = {
      ...EVENT,
      id: "5b1e2d3c-4a5f-4e6d-8c7b-9a0f1e2d3c4b",
      title: "Sortie du 1er mars",
    };
    const calls = stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === "/events" && method === "GET")
        return url.searchParams.get("status") === "needs_review"
          ? json({ items: [{ ...late, status: "needs_review" }] })
          : json({ items: [EVENT], nextCursor: "next" });
      return undefined;
    });
    await renderAppAt("/");

    const card = await screen.findByRole("heading", { level: 2, name: "À vérifier" });

    expect(card.closest("[data-slot=card]")?.textContent).toContain(late.title);
    expect(eventListRequests(calls).some((query) => query.get("status") === "needs_review")).toBe(
      true,
    );
  });

  it("given an event to review, when the parent confirms it, then the toast promises no reminder", async () => {
    stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([CHILD]);
      if (url.pathname === "/events" && method === "GET")
        return json({ items: [{ ...EVENT, status: "needs_review" }] });
      if (url.pathname === `/events/${EVENT.id}/confirm`) return json(EVENT);
      return undefined;
    });
    await renderAppAt("/");

    fireEvent.click(await screen.findByRole("button", { name: "C'est bon" }));

    expect(await screen.findByText("Échéance confirmée")).toBeDefined();
  });
});

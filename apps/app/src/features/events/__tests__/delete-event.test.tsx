// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";
import { queryClient } from "../../../shared/api/query-client";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

const EVENT = {
  ...EVENT_BASE,
  title: "Sortie à la médiathèque",
  description: "",
  category: "school_trip",
  deadlineDate: "2026-11-19",
  deadlineAt: "2026-11-19T23:00:00.000Z",
};
const DETAIL_PATH = `/events/${EVENT.id}`;

describe("deleting an event", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("given the stream announces the change while the page leaves, then the deleted event is never fetched again", async () => {
    let deleted = false;
    const calls = stubApi(({ method, url }) => {
      if (url.pathname === "/children") return json([]);
      if (url.pathname === "/events" && method === "GET") return json({ items: [] });
      if (url.pathname.startsWith(DETAIL_PATH) && method === "GET") {
        if (deleted) return json({ code: "EVENT_NOT_FOUND" }, 404);
        return url.pathname === DETAIL_PATH
          ? json(EVENT)
          : json({ customized: false, reminders: [] });
      }
      if (url.pathname === DETAIL_PATH && method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    const router = await renderAppAt(DETAIL_PATH);
    await screen.findByText("Aucun rappel pour cette échéance.");
    router.subscribe("onBeforeNavigate", () => {
      void queryClient.invalidateQueries({ queryKey: ["events"] });
    });

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    await screen.findByText("Échéance supprimée");
    const afterDelete = calls.slice(calls.findIndex((call) => call.method === "DELETE") + 1);

    expect(afterDelete.filter((call) => call.url.pathname.startsWith(DETAIL_PATH))).toEqual([]);
  });
});

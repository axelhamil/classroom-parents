// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { initI18n } from "@packages/web-kit/i18n/i18n";
import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type ApiCall,
  byRoute,
  json,
  queryClient,
  renderWithProviders,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import { ensureMatchMedia } from "../../../__tests__/match-media";
import type { HomeEditEvent } from "../../../shared/dashboard/home-edit.machine";
import type { Draft } from "../../../shared/dashboard/layout-commands";
import { LayoutSyncNotice } from "../../../shared/dashboard/layout-sync-notice";
import { HOME_LAYOUT_KEY } from "../api/home.queries";
import { type HomeSync, useHomeSync } from "../hooks/use-home-sync";

const REGISTRY = ["today", "notes", "calendar"];

const SAVED: Draft = [
  { id: "today", size: "l" },
  { id: "notes", size: "m" },
];

const REMOTE: Draft = [
  { id: "calendar", size: "xl" },
  { id: "today", size: "l" },
];

const SHRUNK: Draft = [
  { id: "today", size: "m" },
  { id: "notes", size: "m" },
];

const CONFLICT_TITLE = "L'accueil a changé sur un autre appareil";

const putBodySchema = z.object({
  blocks: z.array(z.object({ id: z.string(), size: z.enum(["s", "m", "l", "xl"]) })).nullable(),
  baseRevision: z.number(),
});

interface ServerLayout {
  blocks: Draft | null;
  revision: number;
}

type PutReply = (call: ApiCall, server: ServerLayout) => Response | Promise<Response>;

const latest: { sync?: HomeSync } = {};

function Probe() {
  const sync = useHomeSync("user-1", REGISTRY);
  latest.sync = sync;

  return <LayoutSyncNotice actor={sync.actor} />;
}

function current(): HomeSync {
  if (!latest.sync) throw new Error("The probe is not rendered");

  return latest.sync;
}

const accept: PutReply = (call, server) => {
  server.blocks = putBodySchema.parse(call.body).blocks;
  server.revision += 1;

  return json(server);
};

function givenServer(put: PutReply = accept) {
  const server: ServerLayout = { blocks: SAVED, revision: 0 };
  const calls = stubApi(
    byRoute({
      "GET /home/layout": () => json(server),
      "PUT /home/layout": (call) => put(call, server),
    }),
  );
  const requests = (method: string) =>
    calls.filter((call) => call.method === method && call.url.pathname === "/home/layout");

  return { server, puts: () => requests("PUT"), gets: () => requests("GET") };
}

async function givenHomeShown() {
  ensureMatchMedia();
  await renderWithProviders(<Probe />);
  await waitFor(() => expect(current().order).toEqual(SAVED));
}

function send(...events: HomeEditEvent[]) {
  act(() => {
    for (const event of events) current().send(event);
  });
}

function editAndShrinkToday() {
  send({ type: "EDIT" }, { type: "LOADED" }, { type: "SIZE", id: "today", size: "m" });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

function staleOnce(): PutReply {
  let refused = false;

  return (call, server) => {
    if (refused) return accept(call, server);

    refused = true;
    server.blocks = REMOTE;
    server.revision = 4;

    return json({ error: { code: "HOME_LAYOUT_STALE", message: "stale" } }, 409);
  };
}

describe("The home layout stays in step with the server", () => {
  beforeAll(async () => {
    await initI18n(vi.fn());
  });

  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
    onlineManager.setOnline(true);
    latest.sync = undefined;
  });

  it("given a save in flight, when more gestures follow, then only the last draft leaves after it", async () => {
    const replies: ((response: Response) => void)[] = [];
    const { puts } = givenServer(() => new Promise((resolve) => replies.push(resolve)));
    await givenHomeShown();

    editAndShrinkToday();
    await waitFor(() => expect(puts()).toHaveLength(1));
    send({ type: "HIDE", id: "notes" }, { type: "SHOW", id: "calendar", size: "xl" });
    await settle();
    expect(puts()).toHaveLength(1);

    act(() => replies[0]?.(json({ blocks: SHRUNK, revision: 1 })));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]?.body).toEqual({
      blocks: [
        { id: "today", size: "m" },
        { id: "calendar", size: "xl" },
      ],
      baseRevision: 1,
    });
  });

  it("given a layout changed elsewhere, when the save is refused as stale and the parent keeps theirs, then it is sent again on the new revision", async () => {
    const { puts } = givenServer(staleOnce());
    await givenHomeShown();

    editAndShrinkToday();
    fireEvent.click(await screen.findByRole("button", { name: "Garder la mienne" }));

    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]?.body).toEqual({ blocks: SHRUNK, baseRevision: 4 });
    await waitFor(() => expect(current().syncState).toBe("synced"));
    expect(screen.queryByText(CONFLICT_TITLE)).toBeNull();
  });

  it("given a stale save, when the parent takes the other version, then it is shown and nothing is sent", async () => {
    const { puts } = givenServer(staleOnce());
    await givenHomeShown();

    editAndShrinkToday();
    expect(await screen.findByText(CONFLICT_TITLE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Prendre cette version" }));

    expect(current().order).toEqual(REMOTE);
    await settle();
    expect(puts()).toHaveLength(1);
    expect(screen.queryByText(CONFLICT_TITLE)).toBeNull();
  });

  it("when the server refuses the layout, then the saved one comes back and the refusal is shown", async () => {
    givenServer(() => json({ error: { code: "HOME_LAYOUT_INVALID", message: "invalid" } }, 400));
    await givenHomeShown();

    editAndShrinkToday();

    expect(await screen.findByText(frCatalog.errors.byCode.HOME_LAYOUT_INVALID)).toBeTruthy();
    expect(current().order).toEqual(SAVED);
  });

  it("given no network, when the parent is done, then the edit closes and the save leaves once back online", async () => {
    const { puts } = givenServer();
    await givenHomeShown();

    act(() => onlineManager.setOnline(false));
    editAndShrinkToday();
    send({ type: "DONE" });

    await waitFor(() => expect(current().editState).toBe("viewing"));
    expect(await screen.findByText(frCatalog.home.sync.savedOffline)).toBeTruthy();
    expect(puts()).toHaveLength(0);

    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.body).toEqual({ blocks: SHRUNK, baseRevision: 0 });
  });

  it("given nothing waiting locally, when another device changes the layout, then it is adopted silently", async () => {
    const { server, puts } = givenServer();
    await givenHomeShown();

    server.blocks = REMOTE;
    server.revision = 3;
    await act(() => queryClient.invalidateQueries({ queryKey: HOME_LAYOUT_KEY }));

    await waitFor(() => expect(current().order).toEqual(REMOTE));
    expect(current().revision).toBe(3);
    expect(screen.queryByText(CONFLICT_TITLE)).toBeNull();
    expect(puts()).toHaveLength(0);
  });

  it("when the change notice of our own save comes back, then the gesture under way is kept", async () => {
    const { gets } = givenServer();
    await givenHomeShown();

    editAndShrinkToday();
    await waitFor(() => expect(current().revision).toBe(1));
    send({ type: "KEY_LIFT", id: "notes" });
    const fetched = gets().length;
    await act(() => queryClient.invalidateQueries({ queryKey: HOME_LAYOUT_KEY }));

    await waitFor(() => expect(gets().length).toBeGreaterThan(fetched));
    await settle();
    expect(current().editState).toBe("kbLifted");
    expect(current().order).toEqual(SHRUNK);
  });
});

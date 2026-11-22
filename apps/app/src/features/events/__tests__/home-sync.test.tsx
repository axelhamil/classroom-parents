// @vitest-environment jsdom
import { frCatalog } from "@packages/i18n";
import { initI18n } from "@packages/web-kit/i18n/i18n";
import { userStorageKey } from "@packages/web-kit/storage/use-stored-value";
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
import { ADVISED, blocksIn, type Draft } from "../../../shared/dashboard/layout-commands";
import { LayoutSyncNotice } from "../../../shared/dashboard/layout-sync-notice";
import { HOME_LAYOUT_KEY } from "../api/home.queries";
import { type HomeSync, useHomeSync } from "../hooks/use-home-sync";

const REGISTRY = ["today", "notes", "calendar"];

const SAVED: Draft = [
  { id: "today", size: { w: 2, h: 2 } },
  { id: "notes", size: { w: 2, h: 1 } },
];

const REMOTE: Draft = [
  { id: "calendar", size: { w: 4, h: 2 } },
  { id: "today", size: { w: 2, h: 2 } },
];

const SHRUNK: Draft = [
  { id: "today", size: { w: 2, h: 1 } },
  { id: "notes", size: { w: 2, h: 1 } },
];

const SAVED_IN_CASES = [
  { id: "today", w: 2, h: 2 },
  { id: "notes", w: 2, h: 1 },
];

const REMOTE_IN_CASES = [
  { id: "calendar", w: 4, h: 2 },
  { id: "today", w: 2, h: 2 },
];

const SHRUNK_IN_CASES = [
  { id: "today", w: 2, h: 1 },
  { id: "notes", w: 2, h: 1 },
];

const STORED_LAYOUT_KEY = userStorageKey("user-1", "home:layout:v2");

const CONFLICT_TITLE = "L'accueil a changé sur un autre appareil";

const blockInCasesSchema = z.object({ id: z.string(), w: z.number(), h: z.number() });

type BlockInCases = z.infer<typeof blockInCasesSchema>;

const putBodySchema = z.object({
  v: z.literal(3),
  blocks: z.array(blockInCasesSchema).nullable(),
  baseRevision: z.number(),
});

interface ServerLayout {
  v: 3;
  blocks: BlockInCases[] | null;
  revision: number;
}

type PutReply = (call: ApiCall, server: ServerLayout) => Response | Promise<Response>;

const latest: { sync?: HomeSync } = {};

interface ProbeProps {
  registry?: readonly string[];
}

function Probe({ registry = REGISTRY }: ProbeProps) {
  const sync = useHomeSync("user-1", registry);
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
  const server: ServerLayout = { v: 3, blocks: SAVED_IN_CASES, revision: 0 };
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
  send(
    { type: "EDIT" },
    { type: "LOADED" },
    { type: "SIZE", id: "today", drawn: { w: 2, h: 2 }, size: { w: 2, h: 1 } },
  );
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
    server.blocks = REMOTE_IN_CASES;
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
    send({ type: "HIDE", id: "notes" }, { type: "SHOW", id: "calendar", size: { w: 4, h: 2 } });
    await settle();
    expect(puts()).toHaveLength(1);

    act(() => replies[0]?.(json({ v: 3, blocks: SHRUNK_IN_CASES, revision: 1 })));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]?.body).toEqual({
      v: 3,
      blocks: [
        { id: "today", w: 2, h: 1 },
        { id: "calendar", w: 4, h: 2 },
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
    expect(puts()[1]?.body).toEqual({ v: 3, blocks: SHRUNK_IN_CASES, baseRevision: 4 });
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
    expect(puts()[0]?.body).toEqual({ v: 3, blocks: SHRUNK_IN_CASES, baseRevision: 0 });
  });

  it("given nothing waiting locally, when another device changes the layout, then it is adopted silently", async () => {
    const { server, puts } = givenServer();
    await givenHomeShown();

    server.blocks = REMOTE_IN_CASES;
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

  describe("given the device's copy of the layout still in fixed sizes", () => {
    const FIXED_SIZES_COPY = JSON.stringify({
      v: 2,
      blocks: [
        { id: "calendar", size: "xl" },
        { id: "today", size: "l" },
      ],
      revision: 5,
    });

    it("when the server answers, then its layout is shown and the copy is rewritten in cases", async () => {
      const { server } = givenServer();
      server.revision = 6;
      localStorage.setItem(STORED_LAYOUT_KEY, FIXED_SIZES_COPY);
      ensureMatchMedia();
      await renderWithProviders(<Probe />);

      await waitFor(() => expect(current().order).toEqual(SAVED));
      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem(STORED_LAYOUT_KEY) ?? "null")).toEqual({
          v: 3,
          blocks: SAVED_IN_CASES,
          revision: 6,
        }),
      );
    });

    it("given no network, then the home falls back to the advised layout", async () => {
      givenServer();
      localStorage.setItem(STORED_LAYOUT_KEY, FIXED_SIZES_COPY);
      onlineManager.setOnline(false);
      ensureMatchMedia();
      await renderWithProviders(<Probe />);

      await waitFor(() => expect(current().known).toBe(true));
      expect(current().order).toBeNull();
      expect(current().revision).toBe(-1);
    });
  });

  describe("given the advice-only welcome block", () => {
    const WITH_WELCOME = [...REGISTRY, "welcome"];

    const ADVISED_FOR_NEWCOMER: Draft = [
      { id: "welcome", size: { w: 2, h: 2 } },
      { id: "notes", size: { w: 2, h: 2 } },
      { id: "calendar", size: { w: 4, h: 2 } },
    ];

    const NEWCOMER_SAVED: Draft = [
      { id: "notes", size: { w: 2, h: 1 } },
      { id: "calendar", size: { w: 4, h: 2 } },
    ];

    it("when the parent arranges the advised home that shows it, then the layout saved and drawn leaves it out", async () => {
      const { server, puts } = givenServer();
      server.blocks = null;
      ensureMatchMedia();
      await renderWithProviders(<Probe registry={WITH_WELCOME} />);
      await waitFor(() => expect(current().known).toBe(true));

      send(
        { type: "EDIT", advice: ADVISED_FOR_NEWCOMER },
        { type: "LOADED" },
        { type: "SIZE", id: "notes", drawn: { w: 2, h: 2 }, size: { w: 2, h: 1 } },
        { type: "DONE" },
      );

      await waitFor(() => expect(puts()).toHaveLength(1));
      expect(putBodySchema.parse(puts()[0]?.body).blocks).toEqual([
        { id: "notes", w: 2, h: 1 },
        { id: "calendar", w: 4, h: 2 },
      ]);
      await waitFor(() => expect(current().editState).toBe("viewing"));
      expect(current().order).toEqual(NEWCOMER_SAVED);
    });

    it("given no network, when the parent is done arranging the advised home that shows it, then the layout drawn already leaves it out", async () => {
      const { server, puts } = givenServer();
      server.blocks = null;
      ensureMatchMedia();
      await renderWithProviders(<Probe registry={WITH_WELCOME} />);
      await waitFor(() => expect(current().known).toBe(true));

      act(() => onlineManager.setOnline(false));
      send(
        { type: "EDIT", advice: ADVISED_FOR_NEWCOMER },
        { type: "LOADED" },
        { type: "SIZE", id: "notes", drawn: { w: 2, h: 2 }, size: { w: 2, h: 1 } },
        { type: "DONE" },
      );

      await waitFor(() => expect(current().editState).toBe("viewing"));
      expect(current().order).toEqual(NEWCOMER_SAVED);
      expect(puts()).toHaveLength(0);
    });

    async function givenAdvisedHome() {
      const { server, puts } = givenServer();
      server.blocks = null;
      ensureMatchMedia();
      await renderWithProviders(<Probe registry={WITH_WELCOME} />);
      await waitFor(() => expect(current().known).toBe(true));

      return puts;
    }

    const draftIds = () =>
      blocksIn(current().actor.getSnapshot().context.draft).map(({ id }) => id);

    it("when the parent arranges the advised home that shows it, then it stays pinned first while the others move, and leaves with the edit", async () => {
      await givenAdvisedHome();
      act(() => onlineManager.setOnline(false));

      send({ type: "EDIT", advice: ADVISED_FOR_NEWCOMER }, { type: "LOADED" });
      expect(current().order).toEqual(ADVISED_FOR_NEWCOMER);

      send(
        { type: "KEY_LIFT", id: "calendar" },
        { type: "KEY_MOVE", move: { kind: "edge", edge: "start" } },
        { type: "KEY_DROP" },
      );
      expect(draftIds()).toEqual(["welcome", "calendar", "notes"]);

      send({ type: "LIFT", id: "notes" }, { type: "DRAG_INDEX", index: 0 }, { type: "DROP" });
      expect(draftIds()).toEqual(["welcome", "notes", "calendar"]);

      send(
        { type: "SETTLED" },
        { type: "SIZE", id: "notes", drawn: { w: 2, h: 2 }, size: { w: 2, h: 1 } },
        { type: "DONE" },
      );
      await waitFor(() => expect(current().editState).toBe("viewing"));
      expect(current().order).toEqual(NEWCOMER_SAVED);
      send({ type: "EDIT" }, { type: "LOADED" });
      expect(current().order).toEqual(NEWCOMER_SAVED);
    });

    it("when the parent goes back to the advised layout while arranging, then it is shown where the advice puts it and never saved", async () => {
      const puts = await givenAdvisedHome();

      send(
        { type: "EDIT", advice: ADVISED_FOR_NEWCOMER },
        { type: "LOADED" },
        { type: "RESET" },
        { type: "CONFIRM_RESET", layout: ADVISED, shown: ADVISED_FOR_NEWCOMER },
      );

      expect(draftIds()).toEqual(["welcome", "notes", "calendar"]);
      await waitFor(() => expect(puts()).toHaveLength(1));
      expect(putBodySchema.parse(puts()[0]?.body).blocks).toBeNull();
    });

    it("when a block of the advised home is resized from its menu, then the draft made from it leaves it out", async () => {
      const puts = await givenAdvisedHome();

      send({
        type: "SIZE",
        id: "notes",
        drawn: { w: 2, h: 2 },
        size: { w: 2, h: 1 },
        from: ADVISED_FOR_NEWCOMER,
      });

      expect(draftIds()).toEqual(["notes", "calendar"]);
      await waitFor(() => expect(puts()).toHaveLength(1));
    });

    it("when the server keeps it in a saved layout, then it is dropped without an error", async () => {
      const { server } = givenServer();
      server.blocks = [{ id: "welcome", w: 2, h: 2 }, ...SAVED_IN_CASES];
      ensureMatchMedia();
      await renderWithProviders(<Probe registry={WITH_WELCOME} />);

      await waitFor(() => expect(current().order).toEqual(SAVED));
      expect(screen.queryByText(frCatalog.errors.fallback.saveHomeLayout)).toBeNull();
    });

    it("when the device kept it in its copy of the layout, then it is dropped before the server answers", async () => {
      stubApi(byRoute({ "GET /home/layout": () => new Promise<Response>(() => undefined) }));
      localStorage.setItem(
        STORED_LAYOUT_KEY,
        JSON.stringify({
          v: 3,
          blocks: [{ id: "welcome", w: 2, h: 2 }, ...SAVED_IN_CASES],
          revision: 2,
        }),
      );
      ensureMatchMedia();
      await renderWithProviders(<Probe registry={WITH_WELCOME} />);

      await waitFor(() => expect(current().order).toEqual(SAVED));
    });
  });
});

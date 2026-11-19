import { getShortestPaths } from "@xstate/graph";
import { describe, expect, it, vi } from "vitest";
import {
  type AnyStateNode,
  type AnyTransitionDefinition,
  createActor,
  fromPromise,
  type SnapshotFrom,
  transition,
  waitFor,
} from "xstate";
import {
  type HomeEditEvent,
  type HomeEditInput,
  homeEditMachine,
  type SaveInput,
  type SaveOutcome,
} from "../home-edit.machine";
import type { Draft } from "../layout-commands";

const LAYOUT: Draft = [
  { id: "a", size: "s" },
  { id: "b", size: "m" },
  { id: "c", size: "l" },
];

const REMOTE: Draft = [
  { id: "c", size: "l" },
  { id: "a", size: "s" },
];

const INPUT: HomeEditInput = { layout: LAYOUT, revision: 1, units: 4 };

const EVENTS: HomeEditEvent[] = [
  { type: "EDIT" },
  { type: "LOADED" },
  { type: "DONE" },
  { type: "ESC" },
  { type: "CANCEL" },
  { type: "LIFT", id: "a" },
  { type: "DRAG_INDEX", index: 2 },
  { type: "DROP" },
  { type: "SETTLED" },
  { type: "RESIZE_START", id: "a" },
  { type: "RESIZE", size: "m" },
  { type: "RESIZE_END" },
  { type: "KEY_LIFT", id: "b" },
  { type: "KEY_MOVE", move: { kind: "by", step: -1 } },
  { type: "KEY_SIZE", step: 1, allowed: ["m", "l"] },
  { type: "KEY_DROP" },
  { type: "SIZE", id: "c", size: "xl" },
  { type: "HIDE", id: "a" },
  { type: "SHOW", id: "z", size: "s" },
  { type: "UNDO" },
  { type: "RESET" },
  { type: "CONFIRM_RESET", layout: REMOTE },
  { type: "BREAKPOINT_CHANGED", units: 2 },
  { type: "REMOTE_CHANGED", layout: REMOTE, revision: 5 },
  { type: "ONLINE" },
  { type: "KEEP_MINE" },
  { type: "TAKE_THEIRS" },
  { type: "SAVE_RESULT", outcome: { kind: "ok", revision: 6 } },
  { type: "SAVE_RESULT", outcome: { kind: "network" } },
  { type: "SAVE_RESULT", outcome: { kind: "conflict", remote: { blocks: REMOTE, revision: 7 } } },
  { type: "SAVE_RESULT", outcome: { kind: "rejected" } },
];

const GESTURES = ["dragging", "settling", "resizing", "kbLifted"];

const pendingSave = fromPromise<SaveOutcome, SaveInput>(() => new Promise(() => undefined));

const graphMachine = homeEditMachine.provide({ actors: { save: pendingSave } });

type Snapshot = SnapshotFrom<typeof graphMachine>;

function serialize(state: Snapshot): string {
  const { activeId, unsaved, past, baseRevision, units } = state.context;

  return JSON.stringify({
    value: state.value,
    activeId,
    unsaved: unsaved !== null,
    undo: past.length > 0,
    baseRevision,
    units,
  });
}

const TRAVERSAL = { input: INPUT, events: EVENTS, serializeState: serialize };

function gestureOf(state: Snapshot): string | undefined {
  if (typeof state.value === "string") return undefined;

  const mode = state.value.mode;

  return typeof mode === "object" ? String(mode.editing) : undefined;
}

function isInGesture(state: Snapshot): boolean {
  return GESTURES.includes(gestureOf(state) ?? "");
}

function definedTransitions(node: AnyStateNode): AnyTransitionDefinition[] {
  const own = [...node.transitions.values()]
    .flat()
    .filter((definition) => !definition.eventType.startsWith("xstate."));
  const children = Object.values(node.states).flatMap(definedTransitions);

  return [...own, ...(node.always ?? []), ...children];
}

function transitionsTaken(state: Snapshot, event: HomeEditEvent): AnyTransitionDefinition[] {
  const taken: AnyTransitionDefinition[] = [];
  const actor = createActor(graphMachine, {
    input: INPUT,
    snapshot: graphMachine.getPersistedSnapshot(state),
    inspect: (inspection) => {
      if (inspection.type === "@xstate.microstep") taken.push(...inspection._transitions);
    },
  });

  actor.start();
  actor.send(event);
  actor.stop();

  return taken;
}

function drain(state: Snapshot): Snapshot {
  let current = state;

  for (let attempt = 0; attempt < 10 && !current.matches({ mode: "viewing" }); attempt++)
    [current] = transition(graphMachine, current, nextFlushStep(current));

  return current;
}

function nextFlushStep(state: Snapshot): HomeEditEvent {
  if (state.matches({ sync: "offline" })) return { type: "ONLINE" };
  if (state.matches({ sync: "conflict" })) return { type: "KEEP_MINE" };

  return { type: "SAVE_RESULT", outcome: { kind: "ok", revision: 9 } };
}

describe("home edit machine graph", () => {
  const paths = getShortestPaths(graphMachine, TRAVERSAL);
  const states = paths.map((path) => path.state);

  it("given every event, when the machine is walked, then every transition it declares is taken", () => {
    const taken = new Set(
      states.flatMap((state) => EVENTS.flatMap((event) => transitionsTaken(state, event))),
    );
    const missing = definedTransitions(graphMachine.root).filter(
      (definition) => !taken.has(definition),
    );

    expect(missing.map((definition) => `${definition.source.id} ${definition.eventType}`)).toEqual(
      [],
    );
  });

  it("given the shortest paths, when walked, then every gesture and sync state is reached", () => {
    const reached = new Set(states.map((state) => JSON.stringify(state.value)));

    for (const gesture of [...GESTURES, "loading", "idle", "confirming"])
      expect([...reached].some((value) => value.includes(`"editing":"${gesture}"`))).toBe(true);
    for (const sync of ["synced", "saving", "offline", "conflict"])
      expect([...reached].some((value) => value.includes(`"sync":"${sync}"`))).toBe(true);
  });

  it("given any reachable state, then a block is active exactly during a gesture", () => {
    for (const state of states) expect(state.context.activeId !== null).toBe(isInGesture(state));
  });

  it("given a gesture under way, when another lift arrives, then the active block does not change", () => {
    const lifts = EVENTS.filter((event) =>
      ["LIFT", "KEY_LIFT", "RESIZE_START"].includes(event.type),
    );

    const lifted = states.filter(isInGesture);

    for (const state of lifted)
      for (const lift of lifts) {
        const [next] = transition(graphMachine, state, lift);

        expect(gestureOf(next)).toBe(gestureOf(state));
        expect(next.context.activeId).toBe(state.context.activeId);
        expect(next.context.gestureStart).toBe(state.context.gestureStart);
      }
  });

  it("given any flushing state, when its save drains, then the machine is back to viewing", () => {
    const flushing = states.filter((state) => gestureOf(state) === "flushing");

    expect(flushing.length).toBeGreaterThan(0);
    for (const state of flushing) expect(drain(state).matches({ mode: "viewing" })).toBe(true);
  });
});

interface Deferred {
  input: SaveInput;
  resolve: (outcome: SaveOutcome) => void;
}

function startEditing() {
  const saves: Deferred[] = [];
  const rejected = vi.fn();
  const savedOffline = vi.fn();
  const machine = homeEditMachine.provide({
    actors: {
      save: fromPromise<SaveOutcome, SaveInput>(
        ({ input }) => new Promise((resolve) => saves.push({ input, resolve })),
      ),
    },
  });
  const actor = createActor(machine, { input: INPUT });

  actor.on("saveRejected", rejected);
  actor.on("savedOffline", savedOffline);
  actor.start();

  actor.send({ type: "EDIT" });
  actor.send({ type: "LOADED" });

  return { actor, saves, rejected, savedOffline };
}

function idsOf(draft: Draft): string[] {
  return draft.map((block) => block.id);
}

describe("home edit machine gestures", () => {
  it("given a lifted block moved by keyboard, when escaped, then the order comes back", () => {
    const { actor } = startEditing();

    actor.send({ type: "KEY_LIFT", id: "b" });
    actor.send({ type: "KEY_MOVE", move: { kind: "edge", edge: "end" } });
    actor.send({ type: "ESC" });

    expect(idsOf(actor.getSnapshot().context.draft)).toEqual(["a", "b", "c"]);
    expect(actor.getSnapshot().context.activeId).toBeNull();
  });

  it("given a drag, when the breakpoint changes, then the drag is cancelled and the order restored", () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "LIFT", id: "a" });
    actor.send({ type: "DRAG_INDEX", index: 2 });
    actor.send({ type: "BREAKPOINT_CHANGED", units: 2 });

    expect(actor.getSnapshot().matches({ mode: { editing: "settling" } })).toBe(true);
    expect(idsOf(actor.getSnapshot().context.draft)).toEqual(["a", "b", "c"]);
    expect(saves).toHaveLength(0);
  });

  it("given a commit, when undone, then the previous draft is saved again", () => {
    const { actor } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    actor.send({ type: "UNDO" });

    expect(actor.getSnapshot().context.draft).toBe(LAYOUT);
    expect(actor.getSnapshot().context.unsaved).toBe(LAYOUT);
  });
});

describe("home edit machine sync", () => {
  it("given a keyboard drop, when saved, then the draft becomes the committed layout at the new revision", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "KEY_LIFT", id: "c" });
    actor.send({ type: "KEY_MOVE", move: { kind: "by", step: -1 } });
    actor.send({ type: "KEY_DROP" });
    saves[0]?.resolve({ kind: "ok", revision: 2 });
    await waitFor(actor, (state) => state.matches({ sync: "synced" }));

    expect(saves[0]?.input).toEqual({ blocks: actor.getSnapshot().context.draft, baseRevision: 1 });
    expect(idsOf(actor.getSnapshot().context.committed)).toEqual(["a", "c", "b"]);
    expect(actor.getSnapshot().context.baseRevision).toBe(2);
  });

  it("given commits during a save, when it ends, then only the latest draft is saved next", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    actor.send({ type: "HIDE", id: "b" });
    actor.send({ type: "SHOW", id: "z", size: "s" });
    saves[0]?.resolve({ kind: "ok", revision: 2 });
    await waitFor(actor, () => saves.length === 2);

    expect(saves).toHaveLength(2);
    expect(idsOf(saves[1]?.input.blocks ?? [])).toEqual(["c", "z"]);
    expect(saves[1]?.input.baseRevision).toBe(2);
  });

  it("given a save refused by the server, when it fails, then the draft rolls back and the parent is told", async () => {
    const { actor, saves, rejected } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    saves[0]?.resolve({ kind: "rejected" });
    await waitFor(actor, (state) => state.matches({ sync: "synced" }));

    expect(actor.getSnapshot().context.draft).toBe(LAYOUT);
    expect(rejected).toHaveBeenCalledOnce();
  });

  it("given a network failure, when back online, then the same draft is saved again", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    saves[0]?.resolve({ kind: "network" });
    await waitFor(actor, (state) => state.matches({ sync: "offline" }));
    actor.send({ type: "ONLINE" });

    expect(saves[1]?.input).toEqual(saves[0]?.input);
  });

  it("given a conflict, when the parent keeps theirs, then it is saved on the remote revision", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    saves[0]?.resolve({ kind: "conflict", remote: { blocks: REMOTE, revision: 4 } });
    await waitFor(actor, (state) => state.matches({ sync: "conflict" }));
    actor.send({ type: "KEEP_MINE" });

    expect(saves[1]?.input.baseRevision).toBe(4);
    expect(idsOf(saves[1]?.input.blocks ?? [])).toEqual(["b", "c"]);
  });

  it("given the echo of its own save, when it arrives, then no conflict opens", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    saves[0]?.resolve({ kind: "ok", revision: 2 });
    await waitFor(actor, (state) => state.matches({ sync: "synced" }));
    actor.send({ type: "REMOTE_CHANGED", layout: REMOTE, revision: 2 });

    expect(actor.getSnapshot().matches({ sync: "synced" })).toBe(true);
  });

  it("given a pending save, when the parent is done, then reading waits for the save", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    actor.send({ type: "DONE" });

    expect(actor.getSnapshot().matches({ mode: "viewing" })).toBe(false);
    saves[0]?.resolve({ kind: "ok", revision: 2 });
    await waitFor(actor, (state) => state.matches({ mode: "viewing" }));
    expect(idsOf(actor.getSnapshot().context.committed)).toEqual(["b", "c"]);
  });

  it("given an offline save, when the parent is done, then reading opens at once and the draft is sent back online", async () => {
    const { actor, saves, savedOffline } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    saves[0]?.resolve({ kind: "network" });
    await waitFor(actor, (state) => state.matches({ sync: "offline" }));
    actor.send({ type: "DONE" });

    expect(actor.getSnapshot().matches({ mode: "viewing", sync: "offline" })).toBe(true);
    expect(savedOffline).toHaveBeenCalledOnce();
    expect(idsOf(actor.getSnapshot().context.draft)).toEqual(["b", "c"]);

    actor.send({ type: "ONLINE" });
    saves[1]?.resolve({ kind: "ok", revision: 2 });
    await waitFor(actor, (state) => state.matches({ sync: "synced" }));

    expect(idsOf(saves[1]?.input.blocks ?? [])).toEqual(["b", "c"]);
    expect(idsOf(actor.getSnapshot().context.committed)).toEqual(["b", "c"]);
  });
});

describe("home edit machine remote changes", () => {
  it("given nothing unsaved, when another device changes the layout, then it is adopted silently", () => {
    const { actor } = startEditing();

    actor.send({ type: "REMOTE_CHANGED", layout: REMOTE, revision: 5 });

    expect(actor.getSnapshot().matches({ mode: { editing: "idle" }, sync: "synced" })).toBe(true);
    expect(actor.getSnapshot().context.draft).toBe(REMOTE);
    expect(actor.getSnapshot().context.baseRevision).toBe(5);
  });

  it("given a gesture and nothing unsaved, when another device changes the layout, then the gesture is cancelled and the remote adopted", () => {
    const { actor } = startEditing();

    actor.send({ type: "KEY_LIFT", id: "b" });
    actor.send({ type: "KEY_MOVE", move: { kind: "edge", edge: "start" } });
    actor.send({ type: "REMOTE_CHANGED", layout: REMOTE, revision: 5 });

    expect(actor.getSnapshot().matches({ mode: { editing: "idle" } })).toBe(true);
    expect(actor.getSnapshot().context.activeId).toBeNull();
    expect(actor.getSnapshot().context.draft).toBe(REMOTE);
  });

  it("given an unsaved draft, when another device changes the layout, then the conflict opens and the draft stays", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    saves[0]?.resolve({ kind: "network" });
    await waitFor(actor, (state) => state.matches({ sync: "offline" }));
    actor.send({ type: "REMOTE_CHANGED", layout: REMOTE, revision: 5 });

    expect(actor.getSnapshot().matches({ sync: "conflict" })).toBe(true);
    expect(idsOf(actor.getSnapshot().context.draft)).toEqual(["b", "c"]);
  });
});

describe("home edit machine rollback during a gesture", () => {
  it("given a keyboard lift, when a save is refused, then the gesture is cancelled on the server version", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    actor.send({ type: "SHOW", id: "a", size: "s" });
    actor.send({ type: "KEY_LIFT", id: "b" });
    actor.send({ type: "KEY_MOVE", move: { kind: "edge", edge: "end" } });
    saves[0]?.resolve({ kind: "rejected" });
    await waitFor(actor, (state) => state.matches({ sync: "synced" }));

    expect(actor.getSnapshot().matches({ mode: { editing: "idle" } })).toBe(true);
    expect(actor.getSnapshot().context.activeId).toBeNull();
    expect(actor.getSnapshot().context.draft).toBe(LAYOUT);
  });

  it("given a drag, when a save is refused, then it settles on the server version with no stale start", async () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "HIDE", id: "a" });
    actor.send({ type: "LIFT", id: "b" });
    actor.send({ type: "DRAG_INDEX", index: 1 });
    saves[0]?.resolve({ kind: "rejected" });
    await waitFor(actor, (state) => state.matches({ mode: { editing: "settling" } }));

    expect(actor.getSnapshot().context.draft).toBe(LAYOUT);
    expect(actor.getSnapshot().context.gestureStart).toBe(LAYOUT);
  });
});

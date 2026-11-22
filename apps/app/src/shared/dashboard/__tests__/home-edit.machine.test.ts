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
import { type BlockSize, type BlockSizing, boundsOnGrid } from "../block-size";
import {
  type HomeEditEvent,
  type HomeEditInput,
  homeEditMachine,
  type SaveInput,
  type SaveOutcome,
} from "../home-edit.machine";
import {
  ADVISED,
  blocksIn,
  type Draft,
  type HomeLayout,
  type SizeStep,
  steppedSize,
} from "../layout-commands";

const ONE_BY_ONE = { w: 1, h: 1 };

const TWO_BY_ONE = { w: 2, h: 1 };

const TWO_BY_TWO = { w: 2, h: 2 };

const FOUR_BY_TWO = { w: 4, h: 2 };

const FREE: BlockSizing = {
  bounds: { minW: 1, maxW: 4, minH: 1, maxH: 3 },
  defaultSize: TWO_BY_ONE,
};

const AT_MOST_TWO: BlockSizing = { ...FREE, bounds: { ...FREE.bounds, maxW: 2 } };

/** A size key pressed on the lifted block, from the rectangle it is drawn in now. */
function keySize(
  actor: ReturnType<typeof startEditing>["actor"],
  change: SizeStep,
  drawn: BlockSize,
  sizing = FREE,
) {
  const bounds = boundsOnGrid(sizing, actor.getSnapshot().context.columns);
  const size = steppedSize(drawn, change, bounds);
  if (size) actor.send({ type: "KEY_SIZE", drawn, size });
}

const LAYOUT: Draft = [
  { id: "a", size: ONE_BY_ONE },
  { id: "b", size: TWO_BY_ONE },
  { id: "c", size: TWO_BY_TWO },
];

const REMOTE: Draft = [
  { id: "c", size: TWO_BY_TWO },
  { id: "a", size: ONE_BY_ONE },
];

const INPUT: HomeEditInput = { layout: LAYOUT, revision: 1, columns: 4 };

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
  { type: "RESIZE", drawn: ONE_BY_ONE, size: TWO_BY_ONE },
  { type: "RESIZE_END" },
  { type: "KEY_LIFT", id: "b" },
  { type: "KEY_MOVE", move: { kind: "by", step: -1 } },
  { type: "KEY_SIZE", drawn: TWO_BY_ONE, size: { w: 3, h: 1 } },
  { type: "KEY_DROP" },
  { type: "SIZE", id: "c", drawn: TWO_BY_TWO, size: FOUR_BY_TWO },
  { type: "HIDE", id: "a" },
  { type: "SHOW", id: "z", size: ONE_BY_ONE },
  { type: "UNDO" },
  { type: "RESET" },
  { type: "CONFIRM_RESET", layout: REMOTE },
  { type: "BREAKPOINT_CHANGED", columns: 2 },
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
  const { activeId, unsaved, past, baseRevision, columns } = state.context;

  return JSON.stringify({
    value: state.value,
    activeId,
    unsaved: unsaved !== null,
    undo: past.length > 0,
    baseRevision,
    columns,
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

const ADVICE: Draft = [
  { id: "welcome", size: TWO_BY_TWO },
  { id: "a", size: ONE_BY_ONE },
  { id: "b", size: TWO_BY_ONE },
  { id: "c", size: TWO_BY_TWO },
];

const ADVISED_INPUT: HomeEditInput = {
  ...INPUT,
  layout: ADVISED,
  adviceOnly: ["welcome"],
};

function startEditing(input: HomeEditInput = INPUT, edit: HomeEditEvent = { type: "EDIT" }) {
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
  const actor = createActor(machine, { input });

  actor.on("saveRejected", rejected);
  actor.on("savedOffline", savedOffline);
  actor.start();

  actor.send(edit);
  actor.send({ type: "LOADED" });

  return { actor, saves, rejected, savedOffline };
}

function idsOf(layout: HomeLayout): string[] {
  return blocksIn(layout).map((block) => block.id);
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
    actor.send({ type: "BREAKPOINT_CHANGED", columns: 2 });

    expect(actor.getSnapshot().matches({ mode: { editing: "settling" } })).toBe(true);
    expect(idsOf(actor.getSnapshot().context.draft)).toEqual(["a", "b", "c"]);
    expect(saves).toHaveLength(0);
  });

  it("given a lifted block, when widened, grown, then shortened from the keyboard and laid, then its size is saved once", () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "KEY_LIFT", id: "b" });
    keySize(actor, { axis: "w", step: 1 }, TWO_BY_ONE);
    keySize(actor, { axis: "h", step: 1 }, { w: 3, h: 1 });
    keySize(actor, { axis: "h", step: 1 }, { w: 3, h: 2 });
    keySize(actor, { axis: "h", step: -1 }, { w: 3, h: 3 });
    expect(saves).toHaveLength(0);
    actor.send({ type: "KEY_DROP" });

    expect(blocksIn(actor.getSnapshot().context.draft)[1]).toEqual({
      id: "b",
      size: { w: 3, h: 2 },
    });
    expect(saves).toHaveLength(1);
  });

  it("given a block lifted under a taller neighbour, when it goes up a row, then it lands beside it as drawn on screen", () => {
    const notes: BlockSizing = { ...FREE, raisedAt: [{ columns: 3, minH: 2 }] };
    const home: Draft = [
      { id: "notes", size: TWO_BY_ONE },
      { id: "b", size: ONE_BY_ONE },
      { id: "c", size: ONE_BY_ONE },
      { id: "d", size: ONE_BY_ONE },
    ];
    const sizingOf = (id: string) => (id === "notes" ? notes : undefined);
    const { actor } = startEditing({ ...INPUT, layout: home, columns: 3, sizingOf });

    actor.send({ type: "KEY_LIFT", id: "c" });
    actor.send({ type: "KEY_MOVE", move: { kind: "row", direction: "up" } });
    actor.send({ type: "KEY_DROP" });

    expect(idsOf(actor.getSnapshot().context.draft)).toEqual(["notes", "c", "b", "d"]);
  });

  it("given a lifted block at its largest, when it steps past its bounds or the columns, then nothing changes", () => {
    const { actor } = startEditing({ ...INPUT, columns: 2 });

    actor.send({ type: "KEY_LIFT", id: "b" });
    keySize(actor, { axis: "w", step: 1 }, TWO_BY_ONE);
    keySize(actor, { axis: "h", step: -1 }, TWO_BY_ONE);

    expect(actor.getSnapshot().context.draft).toBe(LAYOUT);
  });

  it("given a lifted block the grid draws wider than its bound to leave no hole, when widened, then nothing changes", () => {
    const pair: Draft = [
      { id: "a", size: TWO_BY_ONE },
      { id: "b", size: TWO_BY_ONE },
    ];
    const { actor, saves } = startEditing({ ...INPUT, layout: pair, columns: 3 });

    actor.send({ type: "KEY_LIFT", id: "a" });
    keySize(actor, { axis: "w", step: 1 }, { w: 3, h: 1 }, AT_MOST_TWO);
    actor.send({ type: "KEY_DROP" });

    expect(actor.getSnapshot().context.draft).toBe(pair);
    expect(saves).toHaveLength(0);
  });

  it("given a pointer resize on a narrower grid, when only the height changes, then the width chosen for a wider screen is kept", () => {
    const { actor, saves } = startEditing({
      ...INPUT,
      layout: [{ id: "x", size: FOUR_BY_TWO }],
      columns: 2,
    });

    actor.send({ type: "RESIZE_START", id: "x" });
    actor.send({ type: "RESIZE", drawn: TWO_BY_TWO, size: { w: 2, h: 3 } });
    actor.send({ type: "RESIZE_END" });

    expect(actor.getSnapshot().context.draft).toEqual([{ id: "x", size: { w: 4, h: 3 } }]);
    expect(saves[0]?.input.blocks).toEqual([{ id: "x", size: { w: 4, h: 3 } }]);
  });

  it("given the advised home with its welcome, when another block is resized, then the welcome stays first and as it was", () => {
    const { actor } = startEditing(ADVISED_INPUT, { type: "EDIT", advice: ADVICE });

    actor.send({ type: "KEY_LIFT", id: "a" });
    keySize(actor, { axis: "w", step: 1 }, ONE_BY_ONE);
    actor.send({ type: "KEY_MOVE", move: { kind: "edge", edge: "start" } });
    actor.send({ type: "KEY_DROP" });

    expect(blocksIn(actor.getSnapshot().context.draft)[0]).toEqual({
      id: "welcome",
      size: TWO_BY_TWO,
    });
    expect(blocksIn(actor.getSnapshot().context.draft)[1]).toEqual({ id: "a", size: TWO_BY_ONE });
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
    actor.send({ type: "SHOW", id: "z", size: ONE_BY_ONE });
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

  it.each([
    ["the advised layout", ADVISED, ["welcome", "a", "b", "c"]],
    ["a saved layout", REMOTE, ["c", "a"]],
  ])(
    "given an advised home arranged on two devices, when the parent takes theirs, %s, then the first steps stay only while the home is advised",
    async (_, theirs, shown) => {
      const { actor, saves } = startEditing(ADVISED_INPUT, { type: "EDIT", advice: ADVICE });

      actor.send({ type: "HIDE", id: "b" });
      saves[0]?.resolve({ kind: "conflict", remote: { blocks: theirs, revision: 4 } });
      await waitFor(actor, (state) => state.matches({ sync: "conflict" }));
      actor.send({ type: "TAKE_THEIRS" });

      expect(actor.getSnapshot().matches({ mode: "editing" })).toBe(true);
      expect(idsOf(actor.getSnapshot().context.draft)).toEqual(shown);
      expect(actor.getSnapshot().context.committed).toBe(theirs);
    },
  );

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
    actor.send({ type: "SHOW", id: "a", size: ONE_BY_ONE });
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

describe("home edit machine trusting the server over the copy kept on the device", () => {
  it("given a kept copy, when the server answers the same revision with other blocks, then its blocks are adopted", () => {
    const actor = createActor(homeEditMachine, { input: INPUT }).start();

    actor.send({ type: "REMOTE_CHANGED", layout: REMOTE, revision: INPUT.revision });

    expect(actor.getSnapshot().context.draft).toBe(REMOTE);
  });
});

describe("home edit machine on the advised layout", () => {
  const SHOWN: Draft = [
    { id: "c", size: TWO_BY_TWO },
    { id: "b", size: TWO_BY_ONE },
  ];

  function startOnAdvice() {
    const saves: Deferred[] = [];
    const machine = homeEditMachine.provide({
      actors: {
        save: fromPromise<SaveOutcome, SaveInput>(
          ({ input }) => new Promise((resolve) => saves.push({ input, resolve })),
        ),
      },
    });
    const actor = createActor(machine, { input: { ...INPUT, layout: ADVISED } }).start();

    return { actor, saves };
  }

  it("given the advised home, when arranged then left untouched, then nothing is saved and the advice comes back", () => {
    const { actor, saves } = startOnAdvice();

    actor.send({ type: "EDIT", advice: SHOWN });
    actor.send({ type: "LOADED" });
    expect(actor.getSnapshot().context.draft).toBe(SHOWN);
    actor.send({ type: "DONE" });

    expect(saves).toHaveLength(0);
    expect(actor.getSnapshot().context.draft).toBe(ADVISED);
  });

  it("given the advised home being arranged, when a block moves, then the layout as shown is saved", () => {
    const { actor, saves } = startOnAdvice();

    actor.send({ type: "EDIT", advice: SHOWN });
    actor.send({ type: "LOADED" });
    actor.send({ type: "KEY_LIFT", id: "b" });
    actor.send({ type: "KEY_MOVE", move: { kind: "edge", edge: "start" } });
    actor.send({ type: "KEY_DROP" });

    expect(idsOf(saves[0]?.input.blocks ?? ADVISED)).toEqual(["b", "c"]);
  });

  it("given the advised home read, when a block is resized from its menu, then the advice as shown is saved resized", () => {
    const { actor, saves } = startOnAdvice();

    actor.send({ type: "SIZE", id: "b", drawn: TWO_BY_ONE, size: TWO_BY_TWO, from: SHOWN });

    expect(saves[0]?.input.blocks).toEqual([
      { id: "c", size: TWO_BY_TWO },
      { id: "b", size: TWO_BY_TWO },
    ]);
  });

  it("given the advice coming back from elsewhere as a copy while arranging, then the advice shown at the start stays shown", () => {
    const { actor } = startEditing(ADVISED_INPUT, { type: "EDIT", advice: ADVICE });

    actor.send({ type: "REMOTE_CHANGED", layout: { kind: "advised" }, revision: 2 });

    expect(actor.getSnapshot().context.draft).toBe(ADVICE);
  });

  it("given an arranged home, when reset, then the advice is saved and shown for the rest of the session", () => {
    const { actor, saves } = startEditing();

    actor.send({ type: "RESET" });
    actor.send({ type: "CONFIRM_RESET", layout: ADVISED, shown: SHOWN });

    expect(saves[0]?.input.blocks).toBe(ADVISED);
    expect(actor.getSnapshot().context.draft).toBe(SHOWN);
  });
});

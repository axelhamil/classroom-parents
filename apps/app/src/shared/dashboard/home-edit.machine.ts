import { and, assign, emit, fromPromise, not, raise, setup, stateIn } from "xstate";
import type { BlockSize, GridUnits } from "./dashboard-pack";
import {
  type Draft,
  type Edge,
  hide,
  keepPinned,
  moveBy,
  moveToEdge,
  moveToIndex,
  moveToRow,
  type RowDirection,
  record,
  resize,
  type Step,
  show,
  stepSize,
  undo,
  withoutPinned,
} from "./layout-commands";

export type KeyMove =
  | { kind: "by"; step: Step }
  | { kind: "row"; direction: RowDirection }
  | {
      kind: "edge";
      edge: Edge;
    };

export interface RemoteLayout {
  blocks: Draft;
  revision: number;
}

export interface SaveInput {
  blocks: Draft;
  baseRevision: number;
}

export type SaveOutcome =
  | { kind: "ok"; revision: number }
  | { kind: "network" }
  | { kind: "conflict"; remote: RemoteLayout }
  | { kind: "rejected" };

export interface HomeEditInput {
  layout: Draft;
  revision: number;
  units: GridUnits;
  /**
   * Blocks only the advice shows: pinned where they stand while the home is arranged, so what is
   * arranged is what was read, and dropped from the layout once the edit ends or a command leaves
   * the advice.
   */
  adviceOnly?: readonly string[];
  /** The layout that stands for "nothing arranged", by identity: taking it while arranging shows the advice again. */
  advisedLayout?: Draft;
}

export interface HomeEditContext {
  committed: Draft;
  draft: Draft;
  activeId: string | null;
  gestureStart: Draft | null;
  past: readonly Draft[];
  baseRevision: number;
  units: GridUnits;
  unsaved: Draft | null;
  inFlight: Draft | null;
  remote: RemoteLayout | null;
  adviceOnly: readonly string[];
  advisedLayout: Draft | null;
  shownAdvice: Draft | null;
}

export type HomeEditEvent =
  | { type: "EDIT"; advice?: Draft }
  | { type: "LOADED" }
  | { type: "DONE" }
  | { type: "ESC" }
  | { type: "CANCEL" }
  | { type: "LIFT"; id: string }
  | { type: "DRAG_INDEX"; index: number }
  | { type: "DROP" }
  | { type: "SETTLED" }
  | { type: "RESIZE_START"; id: string }
  | { type: "RESIZE"; size: BlockSize }
  | { type: "RESIZE_END" }
  | { type: "KEY_LIFT"; id: string }
  | { type: "KEY_MOVE"; move: KeyMove }
  | { type: "KEY_SIZE"; step: Step; allowed: readonly BlockSize[] }
  | { type: "KEY_DROP" }
  | { type: "SIZE"; id: string; size: BlockSize; from?: Draft }
  | { type: "HIDE"; id: string; from?: Draft }
  | { type: "SHOW"; id: string; size: BlockSize }
  | { type: "UNDO" }
  | { type: "RESET" }
  | { type: "CONFIRM_RESET"; layout: Draft; shown?: Draft }
  | { type: "BREAKPOINT_CHANGED"; units: GridUnits }
  | { type: "REMOTE_CHANGED"; layout: Draft; revision: number }
  | { type: "ONLINE" }
  | { type: "KEEP_MINE" }
  | { type: "TAKE_THEIRS" }
  | { type: "SAVE_RESULT"; outcome: SaveOutcome };

export type HomeEditEmitted = { type: "savedOffline" } | { type: "saveRejected" };

const SYNCED = "#homeEdit.sync.synced";

const SAVING = "#homeEdit.sync.saving";

const OFFLINE = "#homeEdit.sync.offline";

const VIEWING = "#homeEdit.mode.viewing";

const isRemoteChange = and(["isNewerRemote", not(stateIn(SAVING))]);

const isSaveRejected = and(["isRejected", stateIn(SAVING)]);

function applyKeyMove(context: HomeEditContext, move: KeyMove): Draft {
  const { draft, activeId, units } = context;
  if (!activeId) return draft;

  if (move.kind === "by") return moveBy(draft, activeId, move.step);
  if (move.kind === "edge") return moveToEdge(draft, activeId, move.edge);

  return moveToRow(draft, activeId, move.direction, units);
}

function commitDraft(context: HomeEditContext, from: Draft, next: Draft): Partial<HomeEditContext> {
  const history = record({ draft: from, past: context.past }, next);
  if (history.draft === from) return { draft: from };

  return { draft: history.draft, past: history.past, unsaved: history.draft };
}

/**
 * The home edit mode as a statechart: a `mode` region (reading, or editing with
 * one gesture at a time) and a `sync` region (optimistic save, coalesced to the
 * latest draft) that outlives the edit mode until the draft is sent. Only
 * discrete events enter it: lift, index change, drop, never a pointer frame.
 * The save is the `save` actor, replaced through `provide` by the real mutation;
 * `savedOffline` and `saveRejected` are emitted for the toasts.
 */
export const homeEditMachine = setup({
  types: {
    context: {} as HomeEditContext,
    events: {} as HomeEditEvent,
    input: {} as HomeEditInput,
    emitted: {} as HomeEditEmitted,
  },
  actors: {
    save: fromPromise<SaveOutcome, SaveInput>(async () => {
      throw new Error("The home layout save actor is provided by the edit mode.");
    }),
  },
  guards: {
    hasUnsaved: ({ context }) => context.unsaved !== null,
    isNewerRemote: ({ context, event }) =>
      event.type === "REMOTE_CHANGED" &&
      (event.revision > context.baseRevision ||
        (event.revision === context.baseRevision && !sameDraft(event.layout, context.committed))),
    isSaved: ({ event }) => event.type === "SAVE_RESULT" && event.outcome.kind === "ok",
    isOffline: ({ event }) => event.type === "SAVE_RESULT" && event.outcome.kind === "network",
    isConflict: ({ event }) => event.type === "SAVE_RESULT" && event.outcome.kind === "conflict",
    isRejected: ({ event }) => event.type === "SAVE_RESULT" && event.outcome.kind === "rejected",
    canUndo: ({ context }) => context.past.length > 0,
  },
  actions: {
    emitSavedOffline: emit({ type: "savedOffline" }),
    emitSaveRejected: emit({ type: "saveRejected" }),
    openSession: assign(({ context, event }) => ({
      past: [],
      activeId: null,
      gestureStart: null,
      draft: event.type === "EDIT" && event.advice ? event.advice : context.draft,
      shownAdvice: event.type === "EDIT" ? (event.advice ?? null) : null,
    })),
    showResetAdvice: assign(({ context, event }) => ({
      draft: event.type === "CONFIRM_RESET" && event.shown ? event.shown : context.draft,
    })),
    settleDraft: assign(({ context }) => ({
      shownAdvice: null,
      draft: kept(
        context,
        context.unsaved === null && context.inFlight === null ? context.committed : context.draft,
      ),
    })),
    adoptRemote: assign(({ context, event }) => {
      if (event.type !== "REMOTE_CHANGED") return {};

      return {
        committed: event.layout,
        draft: shownOf(context, event.layout),
        baseRevision: event.revision,
      };
    }),
    keepRemote: assign(({ event }) => {
      if (event.type !== "REMOTE_CHANGED") return {};

      return { remote: { blocks: event.layout, revision: event.revision } };
    }),
    setUnits: assign(({ context, event }) => ({
      units: event.type === "BREAKPOINT_CHANGED" ? event.units : context.units,
    })),
    startGesture: assign(({ context, event }) => {
      if (event.type !== "LIFT" && event.type !== "KEY_LIFT" && event.type !== "RESIZE_START")
        return {};

      return { activeId: event.id, gestureStart: context.draft };
    }),
    endGesture: assign({ activeId: null, gestureStart: null }),
    restoreGesture: assign(({ context }) => ({ draft: context.gestureStart ?? context.draft })),
    commitGesture: assign(({ context }) =>
      commitDraft(context, context.gestureStart ?? context.draft, context.draft),
    ),
    dragTo: assign(({ context, event }) => {
      if (event.type !== "DRAG_INDEX" || !context.activeId) return {};

      return { draft: pinned(context, moveToIndex(context.draft, context.activeId, event.index)) };
    }),
    resizeActive: assign(({ context, event }) => {
      if (event.type !== "RESIZE" || !context.activeId) return {};

      return { draft: resize(context.draft, context.activeId, event.size) };
    }),
    keyMove: assign(({ context, event }) => {
      if (event.type !== "KEY_MOVE") return {};

      return { draft: pinned(context, applyKeyMove(context, event.move)) };
    }),
    keySize: assign(({ context, event }) => {
      if (event.type !== "KEY_SIZE" || !context.activeId) return {};

      return { draft: stepSize(context.draft, context.activeId, event.step, event.allowed) };
    }),
    applyCommand: assign(({ context, event }) => {
      const base = commandBase(context, event);

      return commitDraft(context, base, pinned(context, commandResult(base, event)));
    }),
    applyReadCommand: assign(({ context, event }) => {
      const base = kept(context, commandBase(context, event));

      return commitDraft(context, base, commandResult(base, event));
    }),
    undoDraft: assign(({ context }) => {
      const history = undo({ draft: context.draft, past: context.past });

      return { draft: history.draft, past: history.past, unsaved: history.draft };
    }),
    beginSave: assign(({ context }) => ({ inFlight: context.unsaved })),
    markSaved: assign(({ context, event }) => {
      if (event.type !== "SAVE_RESULT" || event.outcome.kind !== "ok") return {};

      return {
        committed: context.inFlight ?? context.committed,
        baseRevision: event.outcome.revision,
        unsaved: context.unsaved === context.inFlight ? null : context.unsaved,
        inFlight: null,
      };
    }),
    markConflict: assign(({ event }) => {
      if (event.type !== "SAVE_RESULT" || event.outcome.kind !== "conflict") return {};

      return { remote: event.outcome.remote, inFlight: null };
    }),
    clearInFlight: assign({ inFlight: null }),
    rollback: assign(({ context }) => ({
      draft: context.committed,
      gestureStart: context.gestureStart === null ? null : context.committed,
      unsaved: null,
      inFlight: null,
    })),
    rebaseOnRemote: assign(({ context }) => ({
      baseRevision: context.remote?.revision ?? context.baseRevision,
      unsaved: context.draft,
      remote: null,
    })),
    takeRemote: assign(({ context }) => {
      const remote = context.remote;
      if (!remote) return {};

      return {
        committed: remote.blocks,
        draft: shownOf(context, remote.blocks),
        past: [...context.past, context.draft],
        baseRevision: remote.revision,
        unsaved: null,
        remote: null,
      };
    }),
  },
}).createMachine({
  id: "homeEdit",
  type: "parallel",
  context: ({ input }) => ({
    committed: input.layout,
    draft: input.layout,
    activeId: null,
    gestureStart: null,
    past: [],
    baseRevision: input.revision,
    units: input.units,
    unsaved: null,
    inFlight: null,
    remote: null,
    adviceOnly: input.adviceOnly ?? [],
    advisedLayout: input.advisedLayout ?? null,
    shownAdvice: null,
  }),
  on: {
    BREAKPOINT_CHANGED: { actions: "setUnits" },
  },
  states: {
    mode: {
      initial: "viewing",
      states: {
        viewing: {
          entry: "settleDraft",
          on: {
            EDIT: { target: "editing", actions: "openSession" },
            SIZE: { actions: "applyReadCommand" },
            HIDE: { actions: "applyReadCommand" },
            UNDO: { guard: "canUndo", actions: "undoDraft" },
          },
        },
        editing: {
          initial: "loading",
          states: {
            loading: {
              on: {
                LOADED: "idle",
                DONE: "flushing",
                ESC: "flushing",
              },
            },
            idle: {
              on: {
                LIFT: { target: "dragging", actions: "startGesture" },
                RESIZE_START: { target: "resizing", actions: "startGesture" },
                KEY_LIFT: { target: "kbLifted", actions: "startGesture" },
                SIZE: { actions: "applyCommand" },
                HIDE: { actions: "applyCommand" },
                SHOW: { actions: "applyCommand" },
                UNDO: { guard: "canUndo", actions: "undoDraft" },
                RESET: "confirming",
                DONE: "flushing",
                ESC: "flushing",
              },
            },
            dragging: {
              on: {
                DRAG_INDEX: { actions: "dragTo" },
                DROP: { target: "settling", actions: "commitGesture" },
                CANCEL: { target: "settling", actions: "restoreGesture" },
                ESC: { target: "settling", actions: "restoreGesture" },
                BREAKPOINT_CHANGED: { target: "settling", actions: ["setUnits", "restoreGesture"] },
                REMOTE_CHANGED: {
                  guard: isRemoteChange,
                  target: "settling",
                  actions: "restoreGesture",
                },
                SAVE_RESULT: { guard: isSaveRejected, target: "settling" },
              },
            },
            settling: {
              on: {
                SETTLED: { target: "idle", actions: "endGesture" },
              },
            },
            resizing: {
              on: {
                RESIZE: { actions: "resizeActive" },
                RESIZE_END: { target: "idle", actions: ["commitGesture", "endGesture"] },
                CANCEL: { target: "idle", actions: ["restoreGesture", "endGesture"] },
                ESC: { target: "idle", actions: ["restoreGesture", "endGesture"] },
                BREAKPOINT_CHANGED: {
                  target: "idle",
                  actions: ["setUnits", "restoreGesture", "endGesture"],
                },
                REMOTE_CHANGED: {
                  guard: isRemoteChange,
                  target: "idle",
                  actions: ["restoreGesture", "endGesture"],
                },
                SAVE_RESULT: { guard: isSaveRejected, target: "idle", actions: "endGesture" },
              },
            },
            kbLifted: {
              on: {
                KEY_MOVE: { actions: "keyMove" },
                KEY_SIZE: { actions: "keySize" },
                KEY_DROP: { target: "idle", actions: ["commitGesture", "endGesture"] },
                ESC: { target: "idle", actions: ["restoreGesture", "endGesture"] },
                CANCEL: { target: "idle", actions: ["restoreGesture", "endGesture"] },
                BREAKPOINT_CHANGED: {
                  target: "idle",
                  actions: ["setUnits", "restoreGesture", "endGesture"],
                },
                REMOTE_CHANGED: {
                  guard: isRemoteChange,
                  target: "idle",
                  actions: ["restoreGesture", "endGesture"],
                },
                SAVE_RESULT: { guard: isSaveRejected, target: "idle", actions: "endGesture" },
              },
            },
            confirming: {
              on: {
                CONFIRM_RESET: { target: "idle", actions: ["applyCommand", "showResetAdvice"] },
                CANCEL: "idle",
                ESC: "idle",
              },
            },
            flushing: {
              always: [
                { guard: and([stateIn(SYNCED), not("hasUnsaved")]), target: VIEWING },
                { guard: stateIn(OFFLINE), target: VIEWING, actions: "emitSavedOffline" },
              ],
            },
          },
        },
      },
    },
    sync: {
      initial: "synced",
      states: {
        synced: {
          always: { guard: "hasUnsaved", target: "saving" },
          on: {
            REMOTE_CHANGED: { guard: "isNewerRemote", actions: "adoptRemote" },
          },
        },
        saving: {
          entry: "beginSave",
          invoke: {
            src: "save",
            input: ({ context }) => ({
              blocks: context.inFlight ?? context.draft,
              baseRevision: context.baseRevision,
            }),
            onDone: {
              actions: raise(({ event }) => ({ type: "SAVE_RESULT", outcome: event.output })),
            },
            onError: {
              actions: raise({ type: "SAVE_RESULT", outcome: { kind: "rejected" } }),
            },
          },
          on: {
            SAVE_RESULT: [
              { guard: "isSaved", target: "synced", actions: "markSaved" },
              { guard: "isOffline", target: "offline", actions: "clearInFlight" },
              { guard: "isConflict", target: "conflict", actions: "markConflict" },
              {
                guard: "isRejected",
                target: "synced",
                actions: ["rollback", "emitSaveRejected"],
              },
            ],
          },
        },
        offline: {
          on: {
            ONLINE: "saving",
            REMOTE_CHANGED: { guard: "isNewerRemote", target: "conflict", actions: "keepRemote" },
          },
        },
        conflict: {
          on: {
            KEEP_MINE: { target: "saving", actions: "rebaseOnRemote" },
            TAKE_THEIRS: { target: "synced", actions: "takeRemote" },
            REMOTE_CHANGED: { guard: "isNewerRemote", actions: "keepRemote" },
          },
        },
      },
    },
  },
});

function sameDraft(left: Draft, right: Draft): boolean {
  if (left.length !== right.length) return false;

  return left.every(
    (block, index) => block.id === right[index]?.id && block.size === right[index]?.size,
  );
}

function commandBase(context: HomeEditContext, event: HomeEditEvent): Draft {
  if ((event.type === "SIZE" || event.type === "HIDE") && event.from) return event.from;

  return context.draft;
}

/** A move of the other blocks, the blocks only the advice shows back where they stood. */
function pinned(context: HomeEditContext, next: Draft): Draft {
  return keepPinned(context.draft, next, context.adviceOnly);
}

/** A layout taken from elsewhere while arranging: the advice shown at the start when it is the advised layout. */
function shownOf({ advisedLayout, shownAdvice }: HomeEditContext, layout: Draft): Draft {
  return layout === advisedLayout && shownAdvice ? shownAdvice : layout;
}

/** The layout without the blocks only the advice shows; the same layout when it holds none, so `ADVISED_LAYOUT` keeps its identity. */
function kept({ adviceOnly }: HomeEditContext, layout: Draft): Draft {
  return withoutPinned(layout, adviceOnly);
}

function commandResult(draft: Draft, event: HomeEditEvent): Draft {
  if (event.type === "SIZE") return resize(draft, event.id, event.size);
  if (event.type === "HIDE") return hide(draft, event.id);
  if (event.type === "SHOW") return show(draft, event.id, event.size);
  if (event.type === "CONFIRM_RESET") return event.layout;

  return draft;
}

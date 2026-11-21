import type { TFunction } from "i18next";
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import type { ActorRefFrom } from "xstate";
import { touchFeedback } from "../motion/haptic";
import { type BlockSize, type BlockSizing, type GridColumns, resizeBounds } from "./block-size";
import type { HomeEditEvent, homeEditMachine } from "./home-edit.machine";
import {
  announceCanceled,
  announceDropped,
  announcePosition,
  announceSize,
} from "./layout-announcements";
import {
  blocksIn,
  type Draft,
  type SizeStep,
  steppedSize,
  steppedStored,
  withoutPinned,
} from "./layout-commands";
import { drawnSizeIn } from "./read-geometry";
import type { HandleKey } from "./tile-handle";

export type HomeEditActor = ActorRefFrom<typeof homeEditMachine>;

/** What a tile's handle, menu and keys do to its block. */
export interface Commands {
  edit: () => void;
  focusAdd: () => void;
  step: (id: string, change: SizeStep) => void;
  hide: (id: string) => void;
  moveRow: (id: string, direction: "up" | "down") => void;
  key: (id: string, key: HandleKey) => void;
}

/** What the commands read of the home as it is drawn now. */
export interface CommandInputs {
  order: Draft;
  advised: boolean;
  definitions: ReadonlyMap<string, { title: string; sizing: BlockSizing }>;
  flowing: ReadonlySet<string>;
  cols: GridColumns;
  onEdit: () => void;
  adviceOnly: readonly string[];
}

/** What the commands say and where they put the focus. */
export interface CommandOutputs {
  t: TFunction<"home">;
  announce: (text: string) => void;
  focusAdd: () => void;
  keepFocus: (id: string) => void;
}

interface CommandDeps extends CommandOutputs {
  actor: HomeEditActor;
  latest: RefObject<CommandInputs>;
}

/** A size command on its way: the rectangle it starts from and the one it leads to. */
type SizeApply = (step: { drawn: BlockSize; size: BlockSize }) => void;

/**
 * The commands of the home's tiles, made once: each sends discrete events to the edit machine and
 * says what changed in the live region, reading the home as it is drawn when it runs.
 */
export function useHomeCommands(
  actor: HomeEditActor,
  inputs: CommandInputs,
  outputs: CommandOutputs,
): Commands {
  const latest = useRef(inputs);
  latest.current = inputs;
  const [commands] = useState(() => homeCommands({ ...outputs, actor, latest }));

  return commands;
}

/** The height a tile keeps while resized, in cases: the one it is drawn at when it takes the height of its content. */
export function heldHeightOf(
  id: string,
  drawn: BlockSize,
  cols: GridColumns,
  flowing: ReadonlySet<string>,
): number | undefined {
  return cols === 1 && flowing.has(id) ? drawn.h : undefined;
}

function homeCommands(deps: CommandDeps): Commands {
  const { actor, latest, announce } = deps;
  const home = homeReader(deps);
  const send = (event: HomeEditEvent) => actor.send(event);
  const from = () => (latest.current.advised ? latest.current.order : undefined);

  return {
    edit: () => latest.current.onEdit(),
    focusAdd: deps.focusAdd,
    step: (id, change) =>
      resizer(deps, home)(id, change, from() ?? home.draftNow(), (resized) =>
        send({ type: "SIZE", id, ...resized, from: from() }),
      ),
    hide: (id) => {
      send({ type: "HIDE", id, from: from() });
      toast(deps.t("edit.hidden", { block: home.titleOf(id) }), {
        action: { label: deps.t("edit.undo"), onClick: () => send({ type: "UNDO" }) },
      });
    },
    moveRow: (id, direction) => {
      send({ type: "KEY_LIFT", id });
      send({ type: "KEY_MOVE", move: { kind: "row", direction } });
      send({ type: "KEY_DROP" });
      announce(home.position(id));
    },
    key: keyCommand(deps, home),
  };
}

type HomeReader = ReturnType<typeof homeReader>;

/** The home as the edit machine holds it now, read in the rectangles the screen draws. */
function homeReader({ actor, latest, t }: CommandDeps) {
  const draftNow = () => blocksIn(actor.getSnapshot().context.draft);
  const titleOf = (id: string) => latest.current.definitions.get(id)?.title ?? id;
  const sizingOf = (id: string) => latest.current.definitions.get(id)?.sizing;
  const drawnIn = (blocks: Draft, id: string) => {
    const known = blocks.filter((block) => latest.current.definitions.has(block.id));

    return drawnSizeIn(known, id, latest.current.cols, sizingOf);
  };
  const drawnNow = (id: string) => drawnIn(draftNow(), id);
  const arranged = () => withoutPinned(draftNow(), latest.current.adviceOnly);
  const position = (id: string) => {
    const drawn = drawnNow(id);

    return drawn ? announcePosition(t, arranged(), id, titleOf(id), drawn) : "";
  };

  return { draftNow, titleOf, sizingOf, drawnIn, drawnNow, arranged, position };
}

/**
 * A size step from the rectangle a block is drawn in, sent only when it stores a new size, and
 * said either way: the size drawn, or the bound that stops it.
 */
function resizer({ latest, t, announce }: CommandDeps, home: HomeReader) {
  return (id: string, change: SizeStep, base: Draft, apply: SizeApply) => {
    const drawn = home.drawnIn(base, id);
    const sizing = home.sizingOf(id);
    const stored = base.find((block) => block.id === id)?.size;
    if (!drawn || !sizing || !stored) return;

    const { cols, flowing } = latest.current;
    const bounds = resizeBounds(sizing, cols, heldHeightOf(id, drawn, cols, flowing));
    const size = steppedSize(drawn, change, bounds);
    const writes = steppedStored(stored, drawn, change, bounds) !== undefined;
    if (size && writes) apply({ drawn, size });
    announce(announceSize(t, change, home.drawnNow(id) ?? drawn, bounds, !writes));
  };
}

/** A key pressed on a tile's handle: lift or lay it, move or size it while lifted, or put it back. */
function keyCommand(deps: CommandDeps, home: HomeReader): Commands["key"] {
  const { actor, t, announce } = deps;
  const send = (event: HomeEditEvent) => actor.send(event);
  const resizeBy = resizer(deps, home);

  return (id, key) => {
    deps.keepFocus(id);
    const lifted = actor.getSnapshot().matches({ mode: { editing: "kbLifted" } });

    if (key.kind === "toggle" && lifted) {
      send({ type: "KEY_DROP" });
      touchFeedback("drop");
      announce(announceDropped(t));
      return;
    }

    if (key.kind === "toggle") send({ type: "KEY_LIFT", id });
    if (key.kind === "move") send({ type: "KEY_MOVE", move: key.move });

    if (key.kind === "size") {
      resizeBy(id, key.change, home.draftNow(), (resized) =>
        send({ type: "KEY_SIZE", ...resized }),
      );
      return;
    }

    if (key.kind === "cancel") {
      send({ type: "ESC" });
      announce(announceCanceled(t, home.arranged(), id));
      return;
    }

    announce(home.position(id));
  };
}

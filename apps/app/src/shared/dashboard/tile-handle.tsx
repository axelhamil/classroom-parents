import { IconButton } from "@packages/ui/components/ui/icon-button";
import { DragHandleIcon } from "@packages/ui/components/ui/icons";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { KeyMove } from "./home-edit.machine";
import type { Step } from "./layout-commands";

/** What a key on the handle of a tile asks of the edit mode. */
export type HandleKey =
  | { kind: "toggle" }
  | { kind: "move"; move: KeyMove }
  | { kind: "size"; step: Step }
  | { kind: "cancel" };

const MOVES: Readonly<Record<string, KeyMove>> = {
  ArrowLeft: { kind: "by", step: -1 },
  ArrowRight: { kind: "by", step: 1 },
  ArrowUp: { kind: "row", direction: "up" },
  ArrowDown: { kind: "row", direction: "down" },
  Home: { kind: "edge", edge: "start" },
  End: { kind: "edge", edge: "end" },
};

const SIZE_STEPS: Readonly<Record<string, Step>> = {
  "+": 1,
  "=": 1,
  "-": -1,
  _: -1,
};

export interface TileHandleProps {
  blockId: string;
  title: string;
  lifted: boolean;
  instructionsId: string;
  onKey: (key: HandleKey) => void;
}

/**
 * The grip of a tile: where a finger or the mouse grabs it, and the one control the keyboard moves
 * it with. Space or Enter takes and lays it, the arrows move it, plus and minus change its size and
 * Escape puts it back; a key the handle does not use while the tile rests goes on its way.
 */
export function TileHandle({ blockId, title, lifted, instructionsId, onKey }: TileHandleProps) {
  const { t } = useTranslation("home");

  const press = (event: KeyboardEvent<HTMLButtonElement>) => {
    const key = keyOf(event.key, lifted);
    if (!key) return;

    event.preventDefault();
    event.stopPropagation();
    onKey(key);
  };

  return (
    <IconButton
      type="button"
      variant="ghost"
      size="icon-sm"
      data-handle={blockId}
      aria-roledescription={t("keyboard.roleDescription")}
      aria-describedby={instructionsId}
      aria-pressed={lifted}
      label={t("edit.move", { block: title })}
      onKeyDown={press}
    >
      <DragHandleIcon aria-hidden />
    </IconButton>
  );
}

function keyOf(key: string, lifted: boolean): HandleKey | null {
  if (key === " " || key === "Enter") return { kind: "toggle" };
  if (!lifted) return null;

  if (key === "Escape") return { kind: "cancel" };

  const move = MOVES[key];
  if (move) return { kind: "move", move };

  const step = SIZE_STEPS[key];

  return step ? { kind: "size", step } : null;
}

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@packages/ui/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import {
  ArrangeIcon,
  HideIcon,
  MoreIcon,
  MoveDownIcon,
  MoveUpIcon,
} from "@packages/ui/components/ui/icons";
import type { TFunction } from "i18next";
import { type ReactElement, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { BlockSize, Bounds } from "./block-size";
import { type SizeStep, steppedStored } from "./layout-commands";

/** What the menu of a tile can do to its block, already bound to it. */
export interface TileCommands {
  title: string;
  /** The size the tile is drawn at, in cases. */
  size: BlockSize;
  /** The size the layout keeps for the block: a command that would not change it is greyed out. */
  stored: BlockSize;
  /** The bounds it may be resized within at this width of the grid. */
  bounds: Bounds;
  onStep: (change: SizeStep) => void;
  onHide: () => void;
}

interface SizeCommand {
  change: SizeStep;
  label: "edit.widen" | "edit.narrow" | "edit.grow" | "edit.shorten";
}

const SIZE_COMMANDS: readonly SizeCommand[] = [
  { change: { axis: "w", step: 1 }, label: "edit.widen" },
  { change: { axis: "w", step: -1 }, label: "edit.narrow" },
  { change: { axis: "h", step: 1 }, label: "edit.grow" },
  { change: { axis: "h", step: -1 }, label: "edit.shorten" },
];

interface SizeChoice {
  key: string;
  label: string;
  disabled: boolean;
  select: (event: Event) => void;
}

/**
 * The four size commands of a tile, each greyed once it would keep no new size: stopped by a bound,
 * or narrowing a tile the grid grew past a size already as small. Choosing one keeps the menu open,
 * so a block is stepped to its size without reopening it.
 */
function sizeChoices(
  t: TFunction<"home">,
  { size, stored, bounds, onStep }: Pick<TileCommands, "size" | "stored" | "bounds" | "onStep">,
): SizeChoice[] {
  return SIZE_COMMANDS.map(({ change, label }) => ({
    key: label,
    label: t(label),
    disabled: steppedStored(stored, size, change, bounds) === undefined,
    select: (event) => {
      event.preventDefault();
      onStep(change);
    },
  }));
}

export interface TileEditMenuProps extends TileCommands {
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Where the focus goes once the block is hidden, its own menu gone with it. */
  onHidden: () => void;
}

/**
 * The menu of a tile while the home is arranged: its size now and the commands that widen, narrow,
 * grow or shorten it, a row up or down, and hiding it. Every change a drag makes is reachable here
 * with one pointer or the keyboard alone (WCAG 2.5.7).
 */
export function TileEditMenu({
  title,
  size,
  stored,
  bounds,
  onStep,
  onHide,
  onMoveUp,
  onMoveDown,
  onHidden,
}: TileEditMenuProps) {
  const { t } = useTranslation("home");
  const hiding = useRef(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          type="button"
          variant="ghost"
          size="icon-sm"
          data-no-drag
          label={t("edit.menu", { block: title })}
        >
          <MoreIcon aria-hidden />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (!hiding.current) return;

          event.preventDefault();
          onHidden();
        }}
      >
        <DropdownMenuLabel>{t("edit.sizeNow", { w: size.w, h: size.h })}</DropdownMenuLabel>
        {sizeChoices(t, { size, stored, bounds, onStep }).map((choice) => (
          <DropdownMenuItem key={choice.key} disabled={choice.disabled} onSelect={choice.select}>
            {choice.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMoveUp}>
          <MoveUpIcon aria-hidden />
          {t("edit.moveUp", { block: title })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMoveDown}>
          <MoveDownIcon aria-hidden />
          {t("edit.moveDown", { block: title })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            hiding.current = true;
            onHide();
          }}
        >
          <HideIcon aria-hidden />
          {t("edit.hide", { block: title })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface TileContextMenuProps extends TileCommands {
  header: ReactElement;
  onEdit: () => void;
}

/**
 * The menu a long press or a right click on the header of a block opens while the home is read.
 * Only the header triggers it, so the body keeps its links, the native preview and the swipe of
 * the week.
 */
export function TileContextMenu({
  header,
  title,
  size,
  stored,
  bounds,
  onStep,
  onHide,
  onEdit,
}: TileContextMenuProps) {
  const { t } = useTranslation("home");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onEdit}>
          <ArrangeIcon aria-hidden />
          {t("edit.start")}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t("edit.size")}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuLabel>{t("edit.sizeNow", { w: size.w, h: size.h })}</ContextMenuLabel>
            {sizeChoices(t, { size, stored, bounds, onStep }).map((choice) => (
              <ContextMenuItem key={choice.key} disabled={choice.disabled} onSelect={choice.select}>
                {choice.label}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onHide}>
          <HideIcon aria-hidden />
          {t("edit.hide", { block: title })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

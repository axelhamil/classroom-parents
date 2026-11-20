import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, EyeOffIcon, LayoutGridIcon } from "lucide-react";
import { type ReactElement, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BLOCK_SIZES, type BlockSize } from "./dashboard-pack";

/** What the menu of a tile can do to its block, already bound to it. */
export interface TileCommands {
  title: string;
  size: BlockSize;
  allowed: readonly BlockSize[];
  onSize: (size: BlockSize) => void;
  onHide: () => void;
}

export interface TileEditMenuProps extends TileCommands {
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Where the focus goes once the block is hidden, its own menu gone with it. */
  onHidden: () => void;
}

/**
 * The menu of a tile while the home is arranged: its size among the ones the block allows, a row
 * up or down, and hiding it. Every change a drag makes is reachable here with one pointer or the
 * keyboard alone (WCAG 2.5.7).
 */
export function TileEditMenu({
  title,
  size,
  allowed,
  onSize,
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
          <EllipsisIcon aria-hidden />
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
        <DropdownMenuLabel>{t("edit.size")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={size} onValueChange={(next) => onSize(sizeOf(next, size))}>
          {offered(allowed).map((choice) => (
            <DropdownMenuRadioItem key={choice} value={choice}>
              {t(`sizes.${choice}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMoveUp}>
          <ArrowUpIcon aria-hidden />
          {t("edit.moveUp", { block: title })}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMoveDown}>
          <ArrowDownIcon aria-hidden />
          {t("edit.moveDown", { block: title })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            hiding.current = true;
            onHide();
          }}
        >
          <EyeOffIcon aria-hidden />
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
  allowed,
  onSize,
  onHide,
  onEdit,
}: TileContextMenuProps) {
  const { t } = useTranslation("home");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onEdit}>
          <LayoutGridIcon aria-hidden />
          {t("edit.start")}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>{t("edit.size")}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuRadioGroup
              value={size}
              onValueChange={(next) => onSize(sizeOf(next, size))}
            >
              {offered(allowed).map((choice) => (
                <ContextMenuRadioItem key={choice} value={choice}>
                  {t(`sizes.${choice}`)}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onHide}>
          <EyeOffIcon aria-hidden />
          {t("edit.hide", { block: title })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function offered(allowed: readonly BlockSize[]): BlockSize[] {
  return BLOCK_SIZES.filter((size) => allowed.includes(size));
}

function sizeOf(value: string, fallback: BlockSize): BlockSize {
  return BLOCK_SIZES.find((size) => size === value) ?? fallback;
}

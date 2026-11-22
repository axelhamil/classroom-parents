import { Button } from "@packages/ui/components/ui/button";
import { DashboardTile } from "@packages/ui/components/ui/dashboard";
import { useSelector } from "@xstate/react";
import { type ComponentType, type ReactElement, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SnapshotFrom } from "xstate";
import { type BlockSize, type Bounds, sizeKey } from "./block-size";
import type { DashboardBlock, FullViewProps } from "./dashboard-block";
import type { GridItem } from "./dashboard-pack";
import type { homeEditMachine } from "./home-edit.machine";
import { type KeptScroll, type TileFrame, TileFrameContext } from "./tile-frame";
import { TileHandle } from "./tile-handle";
import { TileContextMenu, TileEditMenu } from "./tile-menus";
import { tileSizeClass } from "./tile-size-class";
import type { Commands, HomeEditActor } from "./use-home-commands";

type HomeEditSnapshot = SnapshotFrom<typeof homeEditMachine>;

export interface HomeTileProps<Context> {
  place: GridItem | undefined;
  block: DashboardBlock<Context>;
  /** The size the layout keeps for the block, as wide as the parent chose it. */
  size: BlockSize;
  /** The rectangle the tile is drawn in, in cases: the room its content is written for. */
  drawn: BlockSize;
  /** The bounds the block may be resized within at this width. */
  bounds: Bounds;
  context: Context;
  editing: boolean;
  flows: boolean;
  hero: boolean;
  /** Drawn where the advice put it and never arranged: no handle, no menu. */
  pinned: boolean;
  instructionsId: string;
  commands: Commands;
  actor: HomeEditActor;
  scroll: KeptScroll;
}

/**
 * One block of the home in its tile: its frame (size, controls, footer) given to the block, its
 * handle and menu while arranged, its context menu on the header while read.
 */
export function HomeTile<Context>({
  place,
  block,
  size,
  drawn: { w, h },
  bounds,
  context,
  editing,
  flows,
  hero,
  pinned,
  instructionsId,
  commands,
  actor,
  scroll,
}: HomeTileProps<Context>) {
  const lifted = useSelector(actor, (snapshot) => isLifted(snapshot, block.id));
  const frame = useMemo<TileFrame>(
    () => ({
      size: { w, h },
      editing,
      flows,
      hero,
      scroll,
      controls: editing && !pinned && (
        <>
          <TileHandle
            blockId={block.id}
            title={block.title}
            lifted={lifted}
            instructionsId={instructionsId}
            onKey={(key) => commands.key(block.id, key)}
          />
          <TileEditMenu
            title={block.title}
            size={{ w, h }}
            stored={size}
            bounds={bounds}
            onStep={(change) => commands.step(block.id, change)}
            onHide={() => commands.hide(block.id)}
            onMoveUp={() => commands.moveRow(block.id, "up")}
            onMoveDown={() => commands.moveRow(block.id, "down")}
            onHidden={commands.focusAdd}
          />
        </>
      ),
      footer: block.fullView && (
        <FullViewFooter view={block.fullView} context={context} title={block.title} />
      ),
      wrapHeader: editing
        ? undefined
        : (header: ReactElement) => (
            <TileContextMenu
              header={header}
              title={block.title}
              size={{ w, h }}
              stored={size}
              bounds={bounds}
              onStep={(change) => commands.step(block.id, change)}
              onHide={() => commands.hide(block.id)}
              onEdit={commands.edit}
            />
          ),
    }),
    [
      w,
      h,
      editing,
      flows,
      hero,
      pinned,
      scroll,
      block,
      context,
      lifted,
      instructionsId,
      commands,
      bounds,
      size,
    ],
  );
  const body = useMemo(
    () => <Body block={block} context={context} frame={frame} />,
    [block, context, frame],
  );

  if (!place) return body;

  return (
    <DashboardTile
      x={place.x}
      y={place.y}
      w={place.w}
      h={place.h}
      data-block={block.id}
      data-size={sizeKey(size)}
      data-content={tileSizeClass(frame.size)}
      data-flows={flows || undefined}
      data-tour={block.tour}
    >
      {body}
    </DashboardTile>
  );
}

interface BodyProps<Context> {
  block: DashboardBlock<Context>;
  context: Context;
  frame: TileFrame;
}

function Body<Context>({ block, context, frame }: BodyProps<Context>) {
  const { Component } = block;

  return (
    <TileFrameContext.Provider value={frame}>
      <Component {...context} blockId={block.id} title={block.title} />
    </TileFrameContext.Provider>
  );
}

interface FullViewFooterProps<Context> {
  view: ComponentType<Context & FullViewProps>;
  context: Context;
  title: string;
}

function FullViewFooter<Context>({ view: View, context, title }: FullViewFooterProps<Context>) {
  const { t } = useTranslation("home");
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t("blocks.seeAll")}
      </Button>
      {open && (
        <View
          {...context}
          title={title}
          onClose={() => setOpen(false)}
          returnFocus={() => (trigger.current ? [trigger.current] : [])}
        />
      )}
    </>
  );
}

function isLifted(snapshot: HomeEditSnapshot, id: string): boolean {
  return snapshot.context.activeId === id && snapshot.matches({ mode: { editing: "kbLifted" } });
}

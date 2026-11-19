import type { SortableTransition } from "@dnd-kit/dom/sortable";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  DashboardBandItem,
  DashboardTile,
  DashboardTileContent,
  DashboardTileToolbar,
} from "@packages/ui/components/ui/dashboard";
import { useTranslation } from "react-i18next";
import { CompactTileContext } from "./compact-tile";
import type { DashboardBlock } from "./dashboard-block";
import type { BlockAxis, BlockStep, HomeBlock } from "./dashboard-layout";
import { resizeBlock } from "./dashboard-layout";
import { TileControls } from "./tile-controls";

export interface TileProps<Context> {
  block: HomeBlock;
  definition: DashboardBlock<Context>;
  context: Context;
  onCompact: (compact: boolean) => void;
}

function TileBody<Context>({ block, definition, context, onCompact }: TileProps<Context>) {
  const { Component, title } = definition;

  return (
    <CompactTileContext value={onCompact}>
      <Component {...context} blockId={block.id} title={title} rows={block.h} />
    </CompactTileContext>
  );
}

export function StaticTile<Context>(props: TileProps<Context>) {
  const { block, definition } = props;

  return (
    <DashboardTile w={block.w} h={block.h} data-block={block.id} data-tour={definition.tour}>
      <TileBody {...props} />
    </DashboardTile>
  );
}

export function BandTile<Context>(props: TileProps<Context>) {
  const { block, definition } = props;

  return (
    <DashboardBandItem data-block={block.id} data-tour={definition.tour}>
      <TileBody {...props} />
    </DashboardBandItem>
  );
}

export interface SortableTileProps<Context> extends TileProps<Context> {
  index: number;
  total: number;
  transition: SortableTransition | null;
  onMove: (step: BlockStep) => void;
  onResize: (next: HomeBlock, axis: BlockAxis, step: BlockStep) => void;
  onHide: () => void;
}

export function SortableTile<Context>({
  block,
  definition,
  context,
  onCompact,
  index,
  total,
  transition,
  onMove,
  onResize,
  onHide,
}: SortableTileProps<Context>) {
  const { t } = useTranslation("home");
  const { ref, handleRef, isDragging } = useSortable({ id: block.id, index, transition });
  const { sizes, title } = definition;
  const resized = (axis: BlockAxis, step: BlockStep) => resizeBlock(block, sizes, axis, step);
  const fits = (axis: BlockAxis) => ({
    1: resized(axis, 1) !== null,
    [-1]: resized(axis, -1) !== null,
  });

  return (
    <DashboardTile
      ref={ref}
      w={block.w}
      h={block.h}
      editing
      dragging={isDragging}
      data-block={block.id}
      data-tour={definition.tour}
    >
      <DashboardTileToolbar aria-label={t("edit.controls", { block: title })}>
        <TileControls
          title={title}
          handleRef={handleRef}
          canMove={{ 1: index < total - 1, [-1]: index > 0 }}
          canResize={{ w: fits("w"), h: fits("h") }}
          onMove={onMove}
          onResize={(axis, step) => {
            const next = resized(axis, step);
            if (next) onResize(next, axis, step);
          }}
          onHide={onHide}
        />
      </DashboardTileToolbar>
      <DashboardTileContent inert>
        <TileBody block={block} definition={definition} context={context} onCompact={onCompact} />
      </DashboardTileContent>
    </DashboardTile>
  );
}

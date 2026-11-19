import type { SortableTransition } from "@dnd-kit/dom/sortable";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  DashboardTile,
  DashboardTileContent,
  DashboardTileToolbar,
} from "@packages/ui/components/ui/dashboard";
import { useTranslation } from "react-i18next";
import type { DashboardBlock } from "./dashboard-block";
import type { BlockAxis, BlockStep, HomeBlock } from "./dashboard-layout";
import { resizeBlock } from "./dashboard-layout";
import { TileControls } from "./tile-controls";

export interface TileProps<Context> {
  block: HomeBlock;
  definition: DashboardBlock<Context>;
  context: Context;
}

export function StaticTile<Context>({ block, definition, context }: TileProps<Context>) {
  const { Component } = definition;

  return (
    <DashboardTile w={block.w} h={block.h} data-block={block.id}>
      <Component {...context} blockId={block.id} title={definition.title} />
    </DashboardTile>
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
  index,
  total,
  transition,
  onMove,
  onResize,
  onHide,
}: SortableTileProps<Context>) {
  const { t } = useTranslation("home");
  const { ref, handleRef, isDragging } = useSortable({ id: block.id, index, transition });
  const { Component, sizes, title } = definition;
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
        <Component {...context} blockId={block.id} title={title} />
      </DashboardTileContent>
    </DashboardTile>
  );
}

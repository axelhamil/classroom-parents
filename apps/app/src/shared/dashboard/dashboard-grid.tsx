import {
  Accessibility,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/dom";
import { isSortable, type SortableTransition } from "@dnd-kit/dom/sortable";
import { type DragDropEventHandlers, DragDropProvider } from "@dnd-kit/react";
import { Dashboard, DashboardBand } from "@packages/ui/components/ui/dashboard";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "../layout/use-media-query";
import type { DashboardBlock } from "./dashboard-block";
import { DashboardEditBar } from "./dashboard-edit-bar";
import {
  type BlockAxis,
  type BlockStep,
  type HomeBlock,
  hideBlock,
  moveBlock,
  placeBlock,
  replaceBlock,
  showBlock,
} from "./dashboard-layout";
import { BandTile, SortableTile, StaticTile } from "./sortable-tile";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const MOVE_DURATION_MS = 220;

export interface DashboardGridProps<Context> {
  layout: readonly HomeBlock[];
  blocks: readonly DashboardBlock<Context>[];
  context: Context;
  editing: boolean;
  onChange: (next: readonly HomeBlock[]) => void;
  onReset: () => void;
  header?: ReactNode;
}

interface Placed<Context> {
  block: HomeBlock;
  definition: DashboardBlock<Context>;
}

function placed<Context>(
  layout: readonly HomeBlock[],
  blocks: readonly DashboardBlock<Context>[],
): Placed<Context>[] {
  return layout.flatMap((block) => {
    const definition = blocks.find((candidate) => candidate.id === block.id);

    return definition ? [{ block, definition }] : [];
  });
}

function marked(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  if (set.has(id) === on) return set;

  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);

  return next;
}

function moveTransition(reduced: boolean): SortableTransition | null {
  if (reduced) return null;

  const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-out-soft");

  return { duration: MOVE_DURATION_MS, easing: easing.trim() || "ease-out", idle: false };
}

export function DashboardGrid<Context>({
  layout,
  blocks,
  context,
  editing,
  onChange,
  onReset,
  header,
}: DashboardGridProps<Context>) {
  const { t } = useTranslation("home");
  const [announcement, setAnnouncement] = useState("");
  const [compact, setCompact] = useState<ReadonlySet<string>>(new Set());
  const addButton = useRef<HTMLButtonElement>(null);
  const reduced = useMediaQuery(REDUCED_MOTION);
  const all = placed(layout, blocks);
  const visible = all.filter(({ block }) => !block.hidden);
  const inBand = ({ block }: Placed<Context>) => !editing && compact.has(block.id);
  const band = visible.filter(inBand);
  const cells = visible.filter((tile) => !inBand(tile));
  const reportOf = (id: string) => (on: boolean) => setCompact((set) => marked(set, id, on));
  const hidden = all.filter(({ block }) => block.hidden).map(({ definition }) => definition);
  const titleOf = (id: unknown) => blocks.find((block) => block.id === id)?.title ?? "";
  const total = visible.length;

  const change = (next: readonly HomeBlock[], message: string) => {
    onChange(next);
    setAnnouncement(message);
  };

  const positionOf = (id: unknown, index: number) => ({
    block: titleOf(id),
    position: index + 1,
    total,
  });

  const announcements = Accessibility.configure({
    screenReaderInstructions: { draggable: t("edit.instructions") },
    announcements: {
      dragstart: ({ operation: { source } }: DragStartEvent) =>
        isSortable(source) ? t("announce.picked", positionOf(source.id, source.index)) : undefined,
      dragover: ({ operation: { source } }: DragOverEvent) =>
        isSortable(source)
          ? t("announce.position", positionOf(source.id, source.index))
          : undefined,
      dragend: ({ operation: { source }, canceled }: DragEndEvent) => {
        if (!isSortable(source)) return undefined;
        const at = positionOf(source.id, canceled ? source.initialIndex : source.index);

        return canceled ? t("announce.canceled", at) : t("announce.dropped", at);
      },
    },
  });

  const onDragEnd: DragDropEventHandlers["onDragEnd"] = ({ operation: { source }, canceled }) => {
    if (canceled || !isSortable(source) || source.index === source.initialIndex) return;

    onChange(placeBlock(layout, String(source.id), source.index));
  };

  const move = (id: string, index: number, step: BlockStep) =>
    change(moveBlock(layout, id, step), t("announce.position", positionOf(id, index + step)));

  const resize = (next: HomeBlock, axis: BlockAxis, step: BlockStep) => {
    const grown = step === 1;
    const message =
      axis === "w"
        ? t(grown ? "announce.widened" : "announce.narrowed", { columns: next.w })
        : t(grown ? "announce.taller" : "announce.shorter", { count: next.h });
    change(replaceBlock(layout, next), message);
  };

  const hide = (id: string) => {
    change(hideBlock(layout, id), t("announce.hidden", { block: titleOf(id) }));
    addButton.current?.focus();
  };

  const show = (id: string) =>
    change(showBlock(layout, id), t("announce.shown", { block: titleOf(id) }));

  const grid = (
    <Dashboard>
      {cells.map(({ block, definition }, index) =>
        editing ? (
          <SortableTile
            key={block.id}
            block={block}
            definition={definition}
            context={context}
            onCompact={reportOf(block.id)}
            index={index}
            total={total}
            transition={moveTransition(reduced)}
            onMove={(step) => move(block.id, index, step)}
            onResize={resize}
            onHide={() => hide(block.id)}
          />
        ) : (
          <StaticTile
            key={block.id}
            block={block}
            definition={definition}
            context={context}
            onCompact={reportOf(block.id)}
          />
        ),
      )}
    </Dashboard>
  );

  return (
    <>
      {editing && (
        <DashboardEditBar addButton={addButton} hidden={hidden} onShow={show} onReset={onReset} />
      )}
      {header}
      {band.length > 0 && (
        <DashboardBand>
          {band.map(({ block, definition }) => (
            <BandTile
              key={block.id}
              block={block}
              definition={definition}
              context={context}
              onCompact={reportOf(block.id)}
            />
          ))}
        </DashboardBand>
      )}
      {editing ? (
        <DragDropProvider
          plugins={(defaults) => [...defaults, announcements]}
          onDragEnd={onDragEnd}
        >
          {grid}
        </DragDropProvider>
      ) : (
        grid
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

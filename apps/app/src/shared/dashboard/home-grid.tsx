import { Dashboard } from "@packages/ui/components/ui/dashboard";
import { useSelector } from "@xstate/react";
import { type ReactNode, Suspense, useEffect, useId, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SnapshotFrom } from "xstate";
import { usePrefetchWhenIdle } from "../perf/prefetch-when-idle";
import { preloadable } from "../perf/preloadable";
import { type BlockSizing, type GridColumns, sizeAt } from "./block-size";
import type { DashboardBlock } from "./dashboard-block";
import { DashboardEditBar } from "./dashboard-edit-bar";
import type { GridItem } from "./dashboard-pack";
import type { homeEditMachine } from "./home-edit.machine";
import {
  leaveOnKey,
  useAnnouncement,
  useColumnsOf,
  useFlowingHeight,
  useGridBounds,
  useHandleFocus,
  useKeptScrolls,
} from "./home-grid-hooks";
import { HomeTile } from "./home-tile";
import { blocksIn, type Draft, withoutPinned } from "./layout-commands";
import type { LayoutBlock } from "./layout-migration";
import { type ReadGeometry, readGeometry } from "./read-geometry";
import { useGridColumns } from "./use-grid-columns";
import { type HomeEditActor, heldHeightOf, useHomeCommands } from "./use-home-commands";

type HomeEditSnapshot = SnapshotFrom<typeof homeEditMachine>;

const { Component: HomeEditGrid, preload: preloadEditGrid } = preloadable(() =>
  import("./edit/home-edit-grid").then((module) => module.default),
);

const OPENED_ON_DEMAND = [preloadEditGrid];

export interface HomeGridProps<Context> {
  order: Draft;
  advised: boolean;
  /** The block the advice chose to answer the question of the moment; worn only while the home is `advised`. */
  heroId: string | null;
  blocks: readonly DashboardBlock<Context>[];
  /** Blocks only the advice places: drawn when it does, pinned while the home is arranged, never offered in the drawer. */
  adviceOnly: readonly string[];
  context: Context;
  actor: HomeEditActor;
  onEdit: () => void;
  onReset: () => void;
  header?: ReactNode;
}

/**
 * The home: a CSS grid placed from the packed sizes while it is read, and the same rectangles on
 * react-grid-layout while it is arranged. Every change goes to the edit machine as one discrete
 * event; the grid only draws its draft. A long press or a right click on the header of a block
 * opens its menu without arranging the whole home.
 */
export function HomeGrid<Context>({
  order,
  advised,
  heroId,
  blocks,
  adviceOnly,
  context,
  actor,
  onEdit,
  onReset,
  header,
}: HomeGridProps<Context>) {
  const { t } = useTranslation("home");
  const cols = useGridColumns();
  const editing = useSelector(actor, isEditing);
  const instructionsId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [announcement, announce] = useAnnouncement();
  const definitions = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const placed = order.filter(({ id }) => definitions.has(id));
  const hidden = withoutPinned(blocks, adviceOnly).filter(
    (block) => !placed.some(({ id }) => id === block.id),
  );
  const sizingOf = useMemo(() => sizingIn(definitions), [definitions]);
  const boundsOf = useGridBounds(cols);
  const focus = useHandleFocus();
  const scrollOf = useKeptScrolls();
  usePrefetchWhenIdle(OPENED_ON_DEMAND);
  useColumnsOf(actor, cols);

  const flowing = flowingOnPhone(definitions);
  const commands = useHomeCommands(
    actor,
    { order, advised, definitions, flowing, cols, onEdit, adviceOnly },
    { t, announce, focusAdd: () => addButton.current?.focus(), keepFocus: focus.keep },
  );

  const show = (id: string) => {
    const block = definitions.get(id);
    if (!block) return;

    actor.send({ type: "SHOW", id, size: block.sizing.defaultSize });
    announce(t("announce.shown", { block: block.title }));
  };

  const geometry = readGeometry(placed, cols, flowing, sizingOf);
  const flows = (id: string) => geometry.tracks !== undefined && flowing.has(id);
  const drawnSizeOf = (block: LayoutBlock) =>
    geometry.sizes.get(block.id) ?? sizeAt(block.size, sizingOf(block.id), cols);

  const tile = (block: LayoutBlock, place?: GridItem) => {
    const definition = definitions.get(block.id);
    if (!definition) return null;

    const drawn = drawnSizeOf(block);

    return (
      <HomeTile
        key={block.id}
        place={place}
        block={definition}
        size={block.size}
        drawn={drawn}
        bounds={boundsOf(definition, heldHeightOf(block.id, drawn, cols, flowing))}
        context={context}
        editing={editing}
        flows={flows(block.id)}
        hero={advised && block.id === heroId}
        pinned={adviceOnly.includes(block.id)}
        instructionsId={instructionsId}
        commands={commands}
        actor={actor}
        scroll={scrollOf(block.id)}
      />
    );
  };

  const readGrid = <ReadGrid placed={placed} cols={cols} geometry={geometry} tile={tile} />;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape and Ctrl+Z bubble here from the controls of the arranged home
    <div className="flex flex-col gap-6" onKeyDown={editing ? leaveOnKey(actor) : undefined}>
      {editing && (
        <DashboardEditBar
          addButton={addButton}
          hidden={hidden}
          onShow={show}
          onReset={onReset}
          onUndo={() => actor.send({ type: "UNDO" })}
        />
      )}
      {header}
      {editing ? (
        <Suspense fallback={readGrid}>
          <EditGrid
            actor={actor}
            order={placed}
            cols={cols}
            sizingOf={sizingOf}
            pinned={adviceOnly}
            tile={(block) => tile(block)}
            fallback={readGrid}
          />
        </Suspense>
      ) : (
        readGrid
      )}
      <p id={instructionsId} className="sr-only">
        {t("keyboard.instructions")}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

interface ReadGridProps {
  placed: Draft;
  cols: GridColumns;
  geometry: ReadGeometry;
  tile: (block: LayoutBlock, place: GridItem) => ReactNode;
}

function ReadGrid({ placed, cols, geometry, tile }: ReadGridProps) {
  return (
    <Dashboard columns={cols} tracks={geometry.tracks}>
      {geometry.tiles.map((place) => {
        const block = placed.find(({ id }) => id === place.i);

        return block ? tile(block, place) : null;
      })}
    </Dashboard>
  );
}

/** The blocks that flow with the page on a phone rather than scroll inside their tile. */
function flowingOnPhone<Context>(
  definitions: ReadonlyMap<string, DashboardBlock<Context>>,
): ReadonlySet<string> {
  return new Set(
    [...definitions.values()].filter((block) => block.flowsOnPhone).map(({ id }) => id),
  );
}

interface EditGridProps {
  actor: HomeEditActor;
  order: Draft;
  cols: GridColumns;
  sizingOf: (id: string) => BlockSizing | undefined;
  pinned: readonly string[];
  tile: (block: LayoutBlock) => ReactNode;
  fallback: ReactNode;
}

/**
 * The arranged home once its chunk is there. During a pointer gesture the grid keeps the order it
 * started from, the library moving the tiles itself; the machine still hears each index change.
 */
function EditGrid({ actor, order, cols, sizingOf, pinned, tile, fallback }: EditGridProps) {
  const start = useSelector(actor, gestureStartOf);
  const flow = useFlowingHeight(cols);
  const send = actor.send;

  useEffect(() => {
    actor.send({ type: "LOADED" });
  }, [actor]);

  return (
    <HomeEditGrid
      order={start ?? order}
      cols={cols}
      flow={flow}
      sizingOf={sizingOf}
      pinned={pinned}
      renderTile={tile}
      fallback={fallback}
      onLift={(id) => send({ type: "LIFT", id })}
      onIndex={(index) => send({ type: "DRAG_INDEX", index })}
      onDrop={() => {
        send({ type: "DROP" });
        send({ type: "SETTLED" });
      }}
      onCancel={() => {
        send({ type: "CANCEL" });
        send({ type: "SETTLED" });
      }}
      onResizeStart={(id) => send({ type: "RESIZE_START", id })}
      onResize={(drawn, size) => send({ type: "RESIZE", drawn, size })}
      onResizeEnd={() => send({ type: "RESIZE_END" })}
    />
  );
}

function sizingIn<Context>(
  definitions: ReadonlyMap<string, DashboardBlock<Context>>,
): (id: string) => BlockSizing | undefined {
  return (id) => definitions.get(id)?.sizing;
}

function isEditing(snapshot: HomeEditSnapshot): boolean {
  return !snapshot.matches({ mode: "viewing" });
}

function gestureStartOf(snapshot: HomeEditSnapshot): Draft | null {
  const pointer =
    snapshot.matches({ mode: { editing: "dragging" } }) ||
    snapshot.matches({ mode: { editing: "settling" } });

  const { gestureStart } = snapshot.context;

  return pointer && gestureStart ? blocksIn(gestureStart) : null;
}

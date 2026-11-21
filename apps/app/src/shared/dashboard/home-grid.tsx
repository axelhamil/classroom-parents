import { Button } from "@packages/ui/components/ui/button";
import { Dashboard, DashboardTile } from "@packages/ui/components/ui/dashboard";
import { useSelector } from "@xstate/react";
import {
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ActorRefFrom, SnapshotFrom } from "xstate";
import { useMediaQuery } from "../layout/use-media-query";
import { touchFeedback } from "../motion/haptic";
import { usePrefetchWhenIdle } from "../perf/prefetch-when-idle";
import { preloadable } from "../perf/preloadable";
import type { DashboardBlock, FullViewProps } from "./dashboard-block";
import { DashboardEditBar } from "./dashboard-edit-bar";
import { type BlockSize, type GridItem, unitsFor } from "./dashboard-pack";
import type { HomeEditEvent, homeEditMachine } from "./home-edit.machine";
import { announceCanceled, announceDropped, announcePosition } from "./layout-announcements";
import { type Draft, withoutPinned } from "./layout-commands";
import type { LayoutBlock } from "./layout-migration";
import { type ReadGeometry, readGeometry } from "./read-geometry";
import { type KeptScroll, type TileFrame, TileFrameContext } from "./tile-frame";
import { type HandleKey, TileHandle } from "./tile-handle";
import { TileContextMenu, TileEditMenu } from "./tile-menus";
import { useGridColumns } from "./use-grid-columns";

type HomeEditActor = ActorRefFrom<typeof homeEditMachine>;

type HomeEditSnapshot = SnapshotFrom<typeof homeEditMachine>;

const { Component: HomeEditGrid, preload: preloadEditGrid } = preloadable(() =>
  import("./edit/home-edit-grid").then((module) => module.default),
);

const OPENED_ON_DEMAND = [preloadEditGrid];

const FINE_POINTER = "(pointer: fine)";

const WIDE_SIZE: BlockSize = "xl";

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

interface Commands {
  edit: () => void;
  focusAdd: () => void;
  size: (id: string, size: BlockSize) => void;
  hide: (id: string) => void;
  moveRow: (id: string, direction: "up" | "down") => void;
  key: (id: string, key: HandleKey) => void;
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
  const units = unitsFor(cols);
  const editing = useSelector(actor, isEditing);
  const instructionsId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const definitions = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const placed = order.filter(({ id }) => definitions.has(id));
  const hidden = withoutPinned(blocks, adviceOnly).filter(
    (block) => !placed.some(({ id }) => id === block.id),
  );
  const allowedOf = useAllowedSizes(definitions, units);
  const tallSizesOf = useMemo(() => tallSizesIn(definitions), [definitions]);
  const focus = useHandleFocus();
  const scrollOf = useKeptScrolls();
  usePrefetchWhenIdle(OPENED_ON_DEMAND);

  const latest = useRef({ order, advised, definitions, allowedOf, editing, onEdit, adviceOnly });
  latest.current = { order, advised, definitions, allowedOf, editing, onEdit, adviceOnly };

  const [commands] = useState<Commands>(() => {
    const send = (event: HomeEditEvent) => actor.send(event);
    const from = () => (latest.current.advised ? latest.current.order : undefined);
    const titleOf = (id: string) => latest.current.definitions.get(id)?.title ?? id;
    const draft = () => withoutPinned(actor.getSnapshot().context.draft, latest.current.adviceOnly);
    const announce = (text: string) => setAnnouncement(text);

    return {
      edit: () => latest.current.onEdit(),
      focusAdd: () => addButton.current?.focus(),
      size: (id, size) => send({ type: "SIZE", id, size, from: from() }),
      hide: (id) => {
        send({ type: "HIDE", id, from: from() });
        toast(t("edit.hidden", { block: titleOf(id) }), {
          action: { label: t("edit.undo"), onClick: () => send({ type: "UNDO" }) },
        });
      },
      moveRow: (id, direction) => {
        send({ type: "KEY_LIFT", id });
        send({ type: "KEY_MOVE", move: { kind: "row", direction } });
        send({ type: "KEY_DROP" });
        announce(announcePosition(t, draft(), id, titleOf(id)));
      },
      key: (id, key) => {
        focus.keep(id);
        const lifted = actor.getSnapshot().matches({ mode: { editing: "kbLifted" } });

        if (key.kind === "toggle" && lifted) {
          send({ type: "KEY_DROP" });
          touchFeedback("drop");
          announce(announceDropped(t));
          return;
        }

        if (key.kind === "toggle") send({ type: "KEY_LIFT", id });
        if (key.kind === "move") send({ type: "KEY_MOVE", move: key.move });
        if (key.kind === "size")
          send({ type: "KEY_SIZE", step: key.step, allowed: latest.current.allowedOf(id) });

        if (key.kind === "cancel") {
          send({ type: "ESC" });
          announce(announceCanceled(t, draft(), id));
          return;
        }

        announce(announcePosition(t, draft(), id, titleOf(id)));
      },
    };
  });

  const show = (id: string) => {
    const block = definitions.get(id);
    if (!block) return;

    actor.send({ type: "SHOW", id, size: block.sizes.defaultSize });
    setAnnouncement(t("announce.shown", { block: block.title }));
  };

  const leaveOnKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;

    if (event.key === "Escape") actor.send({ type: "ESC" });
    if (event.key === "z" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      actor.send({ type: "UNDO" });
    }
  };

  const flowing = flowingOnPhone(definitions);
  const geometry = readGeometry(placed, cols, flowing, tallSizesOf);
  const flows = (id: string) => geometry.tracks !== undefined && flowing.has(id);

  const tile = (block: LayoutBlock, place?: GridItem) => {
    const definition = definitions.get(block.id);
    if (!definition) return null;

    return (
      <HomeTile
        key={block.id}
        place={place}
        block={definition}
        size={block.size}
        allowed={allowedOf(block.id)}
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

  const readGrid = <ReadGrid placed={placed} geometry={geometry} tile={tile} />;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape and Ctrl+Z bubble here from the controls of the arranged home
    <div className="flex flex-col gap-6" onKeyDown={editing ? leaveOnKey : undefined}>
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
            allowedOf={allowedOf}
            tallSizesOf={tallSizesOf}
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
  geometry: ReadGeometry;
  tile: (block: LayoutBlock, place: GridItem) => ReactNode;
}

function ReadGrid({ placed, geometry, tile }: ReadGridProps) {
  return (
    <Dashboard tracks={geometry.tracks}>
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
  cols: number;
  allowedOf: (id: string) => readonly BlockSize[];
  tallSizesOf: (id: string) => readonly BlockSize[];
  pinned: readonly string[];
  tile: (block: LayoutBlock) => ReactNode;
  fallback: ReactNode;
}

/**
 * The arranged home once its chunk is there. During a pointer gesture the grid keeps the order it
 * started from, the library moving the tiles itself; the machine still hears each index change.
 */
function EditGrid({
  actor,
  order,
  cols,
  allowedOf,
  tallSizesOf,
  pinned,
  tile,
  fallback,
}: EditGridProps) {
  const start = useSelector(actor, gestureStartOf);
  const agendaPx = useAgendaHeight(cols);
  const resizable = useMediaQuery(FINE_POINTER) && cols > 4;
  const send = actor.send;

  useEffect(() => {
    actor.send({ type: "LOADED" });
  }, [actor]);

  return (
    <HomeEditGrid
      order={start ?? order}
      cols={cols}
      agendaPx={agendaPx}
      resizable={resizable}
      allowedOf={allowedOf}
      tallSizesOf={tallSizesOf}
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
      onResize={(size) => send({ type: "RESIZE", size })}
      onResizeEnd={() => send({ type: "RESIZE_END" })}
    />
  );
}

interface HomeTileProps<Context> {
  place: GridItem | undefined;
  block: DashboardBlock<Context>;
  size: BlockSize;
  allowed: readonly BlockSize[];
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

function HomeTile<Context>({
  place,
  block,
  size,
  allowed,
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
      size,
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
            size={size}
            allowed={allowed}
            onSize={(next) => commands.size(block.id, next)}
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
              size={size}
              allowed={allowed}
              onSize={(next) => commands.size(block.id, next)}
              onHide={() => commands.hide(block.id)}
              onEdit={commands.edit}
            />
          ),
    }),
    [
      size,
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
      allowed,
    ],
  );
  const body = useMemo(
    () => <Body block={block} context={context} size={size} frame={frame} />,
    [block, context, size, frame],
  );

  if (!place) return body;

  return (
    <DashboardTile
      x={place.x}
      y={place.y}
      w={place.w}
      h={place.h}
      data-block={block.id}
      data-size={size}
      data-tour={block.tour}
    >
      {body}
    </DashboardTile>
  );
}

interface BodyProps<Context> {
  block: DashboardBlock<Context>;
  context: Context;
  size: BlockSize;
  frame: TileFrame;
}

function Body<Context>({ block, context, size, frame }: BodyProps<Context>) {
  const { Component } = block;

  return (
    <TileFrameContext.Provider value={frame}>
      <Component {...context} blockId={block.id} title={block.title} size={size} />
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

function tallSizesIn<Context>(
  definitions: ReadonlyMap<string, DashboardBlock<Context>>,
): (id: string) => readonly BlockSize[] {
  return (id) => definitions.get(id)?.sizes.tallOnTablet ?? [];
}

function useAllowedSizes<Context>(
  definitions: ReadonlyMap<string, DashboardBlock<Context>>,
  units: number,
): (id: string) => readonly BlockSize[] {
  return useMemo(() => {
    const cache = new Map<string, readonly BlockSize[]>();

    return (id: string) => {
      const known = cache.get(id);
      if (known) return known;

      const allowed = (definitions.get(id)?.sizes.allowed ?? []).filter(
        (size) => units === 4 || size !== WIDE_SIZE,
      );
      cache.set(id, allowed);

      return allowed;
    };
  }, [definitions, units]);
}

/** Where each block was scrolled, kept across the two grids so arranging the home loses no place. */
function useKeptScrolls(): (id: string) => KeptScroll {
  const [scrolls] = useState(() => {
    const tops = new Map<string, number>();
    const kept = new Map<string, KeptScroll>();

    return (id: string) => {
      const known = kept.get(id);
      if (known) return known;

      const scroll: KeptScroll = {
        read: () => tops.get(id),
        keep: (top) => tops.set(id, top),
      };
      kept.set(id, scroll);

      return scroll;
    };
  });

  return scrolls;
}

/**
 * The handle a key moved keeps the focus: React takes the node out and puts it back when its tile
 * changes place, which would otherwise drop the focus on the page.
 */
function useHandleFocus() {
  const kept = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = kept.current;
    if (!id) return;

    const handle = document.querySelector<HTMLElement>(`[data-handle="${CSS.escape(id)}"]`);
    if (handle && document.activeElement !== handle) handle.focus();
  });

  return {
    keep: (id: string) => {
      kept.current = id;
    },
  };
}

/** On a phone the Agenda takes the height of its week; arranging keeps that height, measured as read. */
function useAgendaHeight(cols: number): number | undefined {
  const [height] = useState(() => {
    const agenda = document.querySelector<HTMLElement>(
      "[data-slot=dashboard] [data-block=calendar]",
    );

    return agenda?.getBoundingClientRect().height;
  });

  return unitsFor(cols) === 2 ? height : undefined;
}

function isEditing(snapshot: HomeEditSnapshot): boolean {
  return !snapshot.matches({ mode: "viewing" });
}

function isLifted(snapshot: HomeEditSnapshot, id: string): boolean {
  return snapshot.context.activeId === id && snapshot.matches({ mode: { editing: "kbLifted" } });
}

function gestureStartOf(snapshot: HomeEditSnapshot): Draft | null {
  const pointer =
    snapshot.matches({ mode: { editing: "dragging" } }) ||
    snapshot.matches({ mode: { editing: "settling" } });

  return pointer ? snapshot.context.gestureStart : null;
}

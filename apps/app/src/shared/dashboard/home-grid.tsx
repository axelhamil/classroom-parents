import { Button } from "@packages/ui/components/ui/button";
import { Dashboard, DashboardTile } from "@packages/ui/components/ui/dashboard";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { EyeOffIcon } from "lucide-react";
import { type ComponentType, type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DashboardBlock, FullViewProps } from "./dashboard-block";
import { DashboardEditBar } from "./dashboard-edit-bar";
import type { GridItem } from "./dashboard-pack";
import type { LayoutBlock } from "./layout-migration";
import { readGeometry } from "./read-geometry";
import { type TileFrame, TileFrameContext } from "./tile-frame";
import { useGridColumns } from "./use-grid-columns";

export interface HomeGridProps<Context> {
  order: readonly LayoutBlock[];
  blocks: readonly DashboardBlock<Context>[];
  context: Context;
  editing: boolean;
  onChange: (next: LayoutBlock[]) => void;
  onReset: () => void;
  header?: ReactNode;
}

export function HomeGrid<Context>({
  order,
  blocks,
  context,
  editing,
  onChange,
  onReset,
  header,
}: HomeGridProps<Context>) {
  const { t } = useTranslation("home");
  const cols = useGridColumns();
  const addButton = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const definitions = new Map(blocks.map((block) => [block.id, block]));
  const placed = order.filter(({ id }) => definitions.has(id));
  const flowing = new Set(blocks.filter((block) => block.flowsOnPhone).map(({ id }) => id));
  const geometry = readGeometry(placed, cols, flowing);
  const hidden = blocks.filter((block) => !placed.some(({ id }) => id === block.id));

  const hide = (block: DashboardBlock<Context>) => {
    onChange(placed.filter(({ id }) => id !== block.id));
    setAnnouncement(t("announce.hidden", { block: block.title }));
    addButton.current?.focus();
  };

  const show = (id: string) => {
    const block = definitions.get(id);
    if (!block) return;

    onChange([...placed, { id, size: block.sizes.defaultSize }]);
    setAnnouncement(t("announce.shown", { block: block.title }));
  };

  return (
    <>
      {editing && (
        <DashboardEditBar addButton={addButton} hidden={hidden} onShow={show} onReset={onReset} />
      )}
      {header}
      <Dashboard tracks={geometry.tracks}>
        {geometry.tiles.map((tile) => {
          const block = definitions.get(tile.i);
          const size = placed.find(({ id }) => id === tile.i)?.size;
          if (!block || !size) return null;

          return (
            <HomeTile
              key={tile.i}
              tile={tile}
              block={block}
              context={context}
              frame={{
                size,
                editing,
                flows: geometry.tracks !== undefined && flowing.has(tile.i),
                controls: editing && <HideButton title={block.title} onHide={() => hide(block)} />,
                footer: block.fullView && (
                  <FullViewFooter view={block.fullView} context={context} title={block.title} />
                ),
              }}
            />
          );
        })}
      </Dashboard>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

interface HomeTileProps<Context> {
  tile: GridItem;
  block: DashboardBlock<Context>;
  context: Context;
  frame: TileFrame;
}

function HomeTile<Context>({ tile, block, context, frame }: HomeTileProps<Context>) {
  const { Component } = block;

  return (
    <DashboardTile
      x={tile.x}
      y={tile.y}
      w={tile.w}
      h={tile.h}
      data-block={block.id}
      data-size={frame.size}
      data-tour={block.tour}
    >
      <TileFrameContext.Provider value={frame}>
        <Component {...context} blockId={block.id} title={block.title} size={frame.size} />
      </TileFrameContext.Provider>
    </DashboardTile>
  );
}

interface HideButtonProps {
  title: string;
  onHide: () => void;
}

function HideButton({ title, onHide }: HideButtonProps) {
  const { t } = useTranslation("home");

  return (
    <IconButton
      type="button"
      variant="ghost"
      size="icon-sm"
      label={t("edit.hide", { block: title })}
      onClick={onHide}
    >
      <EyeOffIcon aria-hidden />
    </IconButton>
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

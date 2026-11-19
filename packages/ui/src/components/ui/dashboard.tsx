import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * A home made of blocks: one column on a phone (order only), six from `md`
 * and twelve from `lg`. Rows take the height of their content and the page
 * scrolls, never a block. Tiles stretch to their row, so a column never shows
 * a hole between two blocks; placement stays sparse so the screen reads in
 * the order Tab walks it.
 */
function Dashboard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard"
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-(--dashboard-gap) lg:grid-cols-12",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Placement is a static table of classes: Tailwind only ships a class it can
 * read whole in the source. A tablet keeps six columns, so 3 and 4 share a
 * half and 6, 8 and 12 take the full width. The height is a floor of steps,
 * never a cap. A block with nothing to show keeps it, so reading and arranging
 * the home draw every block at the same place and size.
 */
const dashboardTileVariants = cva("flex min-w-0 flex-col gap-2", {
  variants: {
    w: {
      3: "md:col-span-3 lg:col-span-3",
      4: "md:col-span-3 lg:col-span-4",
      6: "md:col-span-6 lg:col-span-6",
      8: "md:col-span-6 lg:col-span-8",
      12: "md:col-span-6 lg:col-span-12",
    },
    h: {
      1: "md:min-h-(--dashboard-row-height)",
      2: "md:row-span-2 md:min-h-(--dashboard-height-2)",
      3: "md:row-span-3 md:min-h-(--dashboard-height-3)",
    },
    editing: {
      true: "rounded-2xl outline-2 outline-offset-4 outline-border outline-dashed data-dragging:z-10 data-dragging:shadow-float",
      false: "",
    },
  },
  defaultVariants: { editing: false },
});

interface DashboardTileProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof dashboardTileVariants> {
  dragging?: boolean;
}

function DashboardTile({ className, w, h, editing, dragging, ...props }: DashboardTileProps) {
  return (
    <div
      data-slot="dashboard-tile"
      data-w={w}
      data-h={h}
      data-dragging={dragging ? "" : undefined}
      className={cn(dashboardTileVariants({ w, h, editing }), className)}
      {...props}
    />
  );
}

/** The controls of a block while the home is being arranged. */
function DashboardTileToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-tile-toolbar"
      role="group"
      className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}
      {...props}
    />
  );
}

/** What the block shows; `inert` while arranging, so Tab walks the controls only. */
function DashboardTileContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-tile-content"
      className={cn("flex min-w-0 flex-1 flex-col", className)}
      {...props}
    />
  );
}

const dashboardPanelVariants = cva(
  "group/panel @container/panel relative flex min-w-0 flex-1 rounded-2xl border bg-card [--focus-surface:var(--color-card)] p-4 text-card-foreground shadow-rest",
  {
    variants: {
      shape: {
        box: "flex-col gap-3",
        line: "flex-row flex-wrap content-center items-center gap-x-3 gap-y-1 py-3",
      },
      fit: {
        card: "",
        natural:
          "max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none",
      },
      tone: {
        default: "",
        hero: "border-primary/30 bg-primary-container [--focus-surface:var(--color-primary-container)] text-foreground",
      },
    },
    defaultVariants: { shape: "box", fit: "card", tone: "default" },
  },
);

interface DashboardPanelProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof dashboardPanelVariants> {}

/**
 * A titled block on paper; label it with `aria-labelledby` pointing at its
 * title. The panel is a size container (`@container/panel`): a block reads its own width,
 * so the same block can be a glance in a narrow tile and a list in a wide one. `line` draws it as one row (title, a short sentence, an action),
 * centred in the size its tile keeps: an empty block reads calm at its size. `natural` is for a block made of cards of its own (the
 * week): a phone shows it at full width on the page, without a card around
 * the cards. `hero` tints the block with the action: only the block that
 * answers "what is next" wears it, so the palette signs the home once.
 */
function DashboardPanel({ className, shape, fit, tone, ...props }: DashboardPanelProps) {
  return (
    <section
      data-slot="dashboard-panel"
      data-shape={shape ?? "box"}
      className={cn(dashboardPanelVariants({ shape, fit, tone }), className)}
      {...props}
    />
  );
}

function DashboardPanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="dashboard-panel-header"
      className={cn(
        "flex min-w-0 items-center gap-2 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function DashboardPanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dashboard-panel-title"
      className={cn(
        "min-w-0 flex-1 font-display text-lg leading-tight font-semibold tracking-tight wrap-anywhere group-data-[shape=line]/panel:text-base",
        className,
      )}
      {...props}
    />
  );
}

/** One plain sentence under the title: the empty state or the figure that sums the block up. */
function DashboardPanelNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dashboard-panel-note"
      className={cn("text-sm text-pretty text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

/**
 * The figure a block is read by at a glance: its first child is the number, set large in a
 * narrow tile and inline once the panel is wide enough to list what it counts, the rest is its
 * label.
 */
function DashboardPanelFigure({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dashboard-panel-figure"
      className={cn(
        "flex min-w-0 items-baseline gap-2 text-sm text-muted-foreground [&>:first-child]:font-display [&>:first-child]:text-4xl [&>:first-child]:leading-none [&>:first-child]:font-bold [&>:first-child]:tracking-tight [&>:first-child]:text-foreground [&>:first-child]:tabular-nums @2xs/panel:[&>:first-child]:text-2xl",
        className,
      )}
      {...props}
    />
  );
}

/**
 * What a block says when it has nothing to show, composed at the size its tile keeps: a mark
 * on a soft disc, a short title and one sentence, centred in the room left under the header.
 * Focusable from code (`tabIndex={-1}`) so the focus has a place to land when the last row
 * leaves. From `md` it adds no height of its own: it fills the tile, so an empty block never
 * pushes its row, reading or arranging.
 */
function DashboardPanelEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-panel-empty"
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl md:contain-size text-center text-sm text-balance text-muted-foreground outline-none focus-visible:ring focus-visible:ring-ring [&>p:first-of-type]:font-display [&>p:first-of-type]:text-base [&>p:first-of-type]:font-semibold [&>p:first-of-type]:text-foreground [&>svg]:size-8 [&>svg]:rounded-full [&>svg]:bg-primary-container [&>svg]:p-2 [&>svg]:text-primary motion-safe:[&>svg]:animate-pop-in",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dashboard,
  DashboardPanel,
  DashboardPanelEmpty,
  DashboardPanelFigure,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
  DashboardTile,
  DashboardTileContent,
  DashboardTileToolbar,
};

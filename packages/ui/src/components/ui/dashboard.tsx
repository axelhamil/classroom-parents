import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

interface DashboardProps extends Omit<React.ComponentProps<"div">, "style"> {
  /**
   * Row tracks written out, for the one grid whose rows are not all one step high (the week flowing
   * with the page on a phone). Left out, every row is one `--dashboard-row-height` step.
   */
  tracks?: string;
}

type TracksStyle = React.CSSProperties & Record<"--dashboard-tracks", string>;

type GridLinesStyle = React.CSSProperties & Record<"--x" | "--y" | "--w" | "--h", number>;

function tracksStyle(tracks: string): TracksStyle {
  return { "--dashboard-tracks": tracks };
}

/**
 * The home grid: 4 columns on a phone, 8 from `md` and 12 from `lg`, every row one step of
 * `--dashboard-row-height`, so a block is as high as its size and never as its content. Tiles are
 * placed explicitly by `DashboardTile`; the page scrolls, a block scrolls inside itself.
 */
function Dashboard({ className, tracks, ...props }: DashboardProps) {
  return (
    <div
      data-slot="dashboard"
      className={cn(
        "grid auto-rows-(--dashboard-row-height) grid-cols-4 grid-rows-(--dashboard-tracks) gap-4 md:grid-cols-8 md:gap-(--dashboard-gap) lg:grid-cols-12",
        className,
      )}
      style={tracks ? tracksStyle(tracks) : undefined}
      {...props}
    />
  );
}

interface DashboardTileProps extends Omit<React.ComponentProps<"div">, "style"> {
  /** First column, 0 based, in grid columns. */
  x: number;
  /** First row track, 0 based. */
  y: number;
  /** Columns spanned. */
  w: number;
  /** Row tracks spanned. */
  h: number;
}

/**
 * One block placed on the grid. Its place is geometry computed at run time from the order and the
 * sizes, so it is the one thing passed through `style`, as the `--x`, `--y`, `--w` and `--h`
 * grid lines; everything the tile looks like stays in the theme.
 */
function DashboardTile({ className, x, y, w, h, ...props }: DashboardTileProps) {
  const place: GridLinesStyle = { "--x": x + 1, "--y": y + 1, "--w": w, "--h": h };

  return (
    <div
      data-slot="dashboard-tile"
      className={cn(
        "flex min-h-0 min-w-0 flex-col [grid-column:var(--x)/span_var(--w)] [grid-row:var(--y)/span_var(--h)]",
        className,
      )}
      style={place}
      {...props}
    />
  );
}

const dashboardPanelVariants = cva(
  "group/panel @container/panel relative flex min-h-0 min-w-0 flex-1 scroll-mt-24 flex-col [--focus-surface:var(--color-card)] text-card-foreground outline-none focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      fit: {
        card: "rounded-surface border bg-card px-surface pb-surface pt-1 shadow-rest",
        natural:
          "md:rounded-surface md:border md:bg-card md:px-surface md:pb-surface md:pt-1 md:shadow-rest",
      },
      tone: {
        default: "",
        hero: "border-primary/30 bg-primary-container [--focus-surface:var(--color-primary-container)] text-foreground",
      },
    },
    defaultVariants: { fit: "card", tone: "default" },
  },
);

interface DashboardPanelProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof dashboardPanelVariants> {}

/**
 * A titled block on paper; label it with `aria-labelledby` pointing at its title. It lays out a header
 * of a fixed height, a body that takes what is left, then an optional footer, so every tile of one
 * size looks the same whatever it holds. The body starts right under the header: half the header's
 * height already sits below the title, as much as the room above it. `natural` is for a block made of cards of its own (the
 * week): a phone shows it on the page, without a card around the cards. The panel is a size
 * container (`@container/panel`): a block reads its own width, so the same block can be a glance
 * in a narrow tile and a list in a wide one. `hero` tints the block with the action: only the
 * block that answers "what is next" wears it, so the palette signs the home once.
 */
function DashboardPanel({ className, fit, tone, ...props }: DashboardPanelProps) {
  return (
    <section
      data-slot="dashboard-panel"
      data-tone={tone ?? "default"}
      className={cn(dashboardPanelVariants({ fit, tone }), className)}
      {...props}
    />
  );
}

const DASHBOARD_HEADER =
  "flex h-dashboard-header min-w-0 shrink-0 items-center gap-2 [&>svg]:size-icon-lg [&>svg]:shrink-0 [&>svg]:text-primary";

/**
 * The title row of a block, one fixed height so the titles of a row share their line. Its slot is
 * set after the props: a trigger that wraps it `asChild` (a context menu) would otherwise rename it.
 */
function DashboardPanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(DASHBOARD_HEADER, className)}
      {...props}
      data-slot="dashboard-panel-header"
    />
  );
}

/**
 * The controls of a block while the home is arranged, in the slot of its header and at its height.
 * It is where the block is grabbed: a finger on it drags at once instead of scrolling the page, and
 * holding it neither selects its words nor opens the system's callout.
 */
function DashboardTileToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-tile-toolbar"
      role="group"
      className={cn(
        DASHBOARD_HEADER,
        "cursor-grab touch-none select-none [-webkit-touch-callout:none] active:cursor-grabbing",
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
      className={cn("min-w-0 flex-1 truncate font-display text-title", className)}
      {...props}
    />
  );
}

/**
 * The body of a block that never scrolls: a glance sized to fit, or a block that flows with the
 * page. A body that may overflow is a `ScrollRegion variant="tile"` instead.
 */
function DashboardPanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-panel-body"
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden", className)}
      {...props}
    />
  );
}

/** One plain sentence under the title: the figure that sums the block up. */
function DashboardPanelNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dashboard-panel-note"
      className={cn("text-small text-pretty text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

/** What stays under the body: the way to the full view of the block. */
function DashboardPanelFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="dashboard-panel-footer"
      className={cn("flex shrink-0 items-center justify-end pt-2", className)}
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
        "flex min-w-0 items-baseline gap-2 text-small text-muted-foreground [&>:first-child]:font-display [&>:first-child]:text-display [&>:first-child]:text-foreground [&>:first-child]:tabular-nums @2xs/panel:[&>:first-child]:text-title",
        className,
      )}
      {...props}
    />
  );
}

/**
 * What a block says when it has nothing to show, composed at the size its tile keeps: an
 * `IconTile` tinted with the action (on paper inside the hero block or a briefing, already
 * tinted), a short title and one sentence, each held to two lines since the sentence may quote
 * a deadline's title, centred in the room left under the header.
 * Focusable from code (`tabIndex={-1}`) so the focus has a place to land when the last row
 * leaves. It adds no height of its own and fills the body of its tile, which the grid sizes: in a
 * short tile it drops the icon tile, then holds the sentence to one line, so the title is never
 * cut.
 */
function DashboardPanelEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-panel-empty"
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-inner [container-type:size] text-center text-small text-balance text-muted-foreground outline-none focus-visible:ring focus-visible:ring-ring [&>p:first-of-type]:font-display [&>p:first-of-type]:text-heading [&>p:first-of-type]:text-foreground [&>p]:line-clamp-2 [@container(max-height:6rem)]:[&>[data-slot=icon-tile]]:hidden [@container(max-height:8rem)_and_(max-width:15rem)]:[&>[data-slot=icon-tile]]:hidden [@container(max-height:7rem)_and_(max-width:24rem)]:[&>[data-slot=icon-tile]]:hidden [@container(max-height:4.5rem)]:[&>p:last-of-type]:line-clamp-1 [&>[data-slot=icon-tile]]:bg-primary-container [&>[data-slot=icon-tile]]:text-primary group-data-[tone=hero]/panel:[&>[data-slot=icon-tile]]:bg-card in-data-[slot=briefing]:[&>[data-slot=icon-tile]]:bg-card motion-safe:[&>[data-slot=icon-tile]]:animate-pop-in",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dashboard,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelEmpty,
  DashboardPanelFigure,
  DashboardPanelFooter,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
  DashboardTile,
  DashboardTileToolbar,
};

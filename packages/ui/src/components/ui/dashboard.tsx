import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * A home made of blocks: one column on a phone (order only), six from `md`
 * and twelve from `lg`, rows of one fixed height so a block's size is a
 * number of columns and rows, never a pixel value.
 */
function Dashboard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard"
      className={cn(
        "grid grid-cols-1 gap-4 md:auto-rows-(--dashboard-row-height) md:grid-cols-6 md:gap-5 lg:grid-cols-12",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Placement is a static table of classes: Tailwind only ships a class it can
 * read whole in the source. A tablet keeps six columns, so 3 and 4 share a
 * half and 6, 8 and 12 take the full width.
 */
const dashboardTileVariants = cva("flex min-h-0 min-w-0 flex-col gap-2", {
  variants: {
    w: {
      3: "md:col-span-3 lg:col-span-3",
      4: "md:col-span-3 lg:col-span-4",
      6: "md:col-span-6 lg:col-span-6",
      8: "md:col-span-6 lg:col-span-8",
      12: "md:col-span-6 lg:col-span-12",
    },
    h: {
      1: "md:row-span-1",
      2: "md:row-span-2",
      3: "md:row-span-3",
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
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
      {...props}
    />
  );
}

const dashboardPanelVariants = cva(
  "flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground shadow-rest [--scroll-fade-surface:var(--card)]",
  {
    variants: {
      fit: {
        capped: "max-h-(--dashboard-panel-phone-height) md:max-h-none",
        natural:
          "max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none max-md:[--scroll-fade-surface:var(--background)]",
      },
    },
    defaultVariants: { fit: "capped" },
  },
);

interface DashboardPanelProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof dashboardPanelVariants> {}

/**
 * A titled block on paper; label it with `aria-labelledby` pointing at its
 * title. `natural` is for a block made of cards of its own (the week): a phone
 * shows it at full width on the page, without a card around the cards.
 */
function DashboardPanel({ className, fit, ...props }: DashboardPanelProps) {
  return (
    <section
      data-slot="dashboard-panel"
      className={cn(dashboardPanelVariants({ fit }), className)}
      {...props}
    />
  );
}

function DashboardPanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="dashboard-panel-header"
      className={cn(
        "flex min-w-0 items-center gap-2 [&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
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
        "min-w-0 flex-1 font-display text-lg leading-tight font-semibold tracking-tight wrap-anywhere",
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

export {
  Dashboard,
  DashboardPanel,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
  DashboardTile,
  DashboardTileContent,
  DashboardTileToolbar,
};

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const plannerCardVariants = cva(
  "@container/planner-card flex w-full min-w-0 items-start gap-3 rounded-inner p-block outline-none hover:bg-accent focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      muted: {
        false: "bg-surface-container text-card-foreground",
        true: "bg-surface-container text-muted-foreground",
      },
      hue: {
        1: "bg-child-1-container hover:bg-child-1-container",
        2: "bg-child-2-container hover:bg-child-2-container",
        3: "bg-child-3-container hover:bg-child-3-container",
        4: "bg-child-4-container hover:bg-child-4-container",
        5: "bg-child-5-container hover:bg-child-5-container",
        6: "bg-child-6-container hover:bg-child-6-container",
        7: "bg-child-7-container hover:bg-child-7-container",
        8: "bg-child-8-container hover:bg-child-8-container",
        9: "bg-child-9-container hover:bg-child-9-container",
        10: "bg-child-10-container hover:bg-child-10-container",
        11: "bg-child-11-container hover:bg-child-11-container",
        12: "bg-child-12-container hover:bg-child-12-container",
        13: "bg-child-13-container hover:bg-child-13-container",
        14: "bg-child-14-container hover:bg-child-14-container",
        15: "bg-child-15-container hover:bg-child-15-container",
        16: "bg-child-16-container hover:bg-child-16-container",
      },
    },
    defaultVariants: { muted: false },
  },
);

interface PlannerCardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof plannerCardVariants> {
  asChild?: boolean;
}

/**
 * A deadline on paper. With a `hue`, the card takes the container of the
 * child it belongs to: the background says who, nothing else on the card
 * repeats it in color.
 */
function PlannerCard({ className, muted, hue, asChild = false, ...props }: PlannerCardProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="planner-card"
      data-muted={muted ? "" : undefined}
      className={cn(plannerCardVariants({ muted, hue }), className)}
      {...props}
    />
  );
}

function PlannerCardBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="planner-card-body"
      className={cn(
        "grid min-w-0 flex-1 grid-cols-1 content-start gap-x-4 gap-y-2 @lg/planner-card:grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
      {...props}
    />
  );
}

function PlannerCardTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-card-title"
      className={cn("line-clamp-2 text-heading wrap-anywhere", className)}
      {...props}
    />
  );
}

function PlannerCardMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-card-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground @lg/planner-card:col-start-1",
        className,
      )}
      {...props}
    />
  );
}

function PlannerCardStickers({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-card-stickers"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1.5 @lg/planner-card:col-start-2 @lg/planner-card:row-span-2 @lg/planner-card:row-start-1 @lg/planner-card:max-w-64 @lg/planner-card:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export { PlannerCard, PlannerCardBody, PlannerCardMeta, PlannerCardStickers, PlannerCardTitle };

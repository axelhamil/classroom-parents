import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const plannerCardVariants = cva(
  "@container/planner-card flex w-full min-w-0 items-start gap-3 rounded-xl border p-3 outline-none hover:bg-accent focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      muted: {
        false: "bg-card text-card-foreground shadow-xs hover:shadow-sm",
        true: "border-dashed bg-surface-container text-muted-foreground",
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

function PlannerCard({ className, muted, asChild = false, ...props }: PlannerCardProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="planner-card"
      data-muted={muted ? "" : undefined}
      className={cn(plannerCardVariants({ muted }), className)}
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
      className={cn(
        "line-clamp-2 font-semibold leading-snug wrap-anywhere @md/planner-card:text-lg",
        className,
      )}
      {...props}
    />
  );
}

function PlannerCardMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-card-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground @lg/planner-card:col-start-1",
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

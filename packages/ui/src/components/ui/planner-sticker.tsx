import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const plannerStickerVariants = cva(
  "flex w-full min-w-0 flex-col gap-1.5 rounded-xl border border-transparent p-2.5 text-sm text-foreground outline-none hover:shadow-raised focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      hue: {
        1: "bg-child-1-container",
        2: "bg-child-2-container",
        3: "bg-child-3-container",
        4: "bg-child-4-container",
        5: "bg-child-5-container",
        6: "bg-child-6-container",
        7: "bg-child-7-container",
        8: "bg-child-8-container",
      },
      urgent: {
        true: "border-warning",
        false: "",
      },
    },
    defaultVariants: { urgent: false },
  },
);

interface PlannerStickerProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof plannerStickerVariants> {
  asChild?: boolean;
}

function PlannerSticker({
  className,
  hue,
  urgent,
  asChild = false,
  ...props
}: PlannerStickerProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      className={cn(plannerStickerVariants({ hue, urgent }), className)}
      {...props}
      data-slot="planner-sticker"
    />
  );
}

function PlannerStickerTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-sticker-title"
      className={cn("line-clamp-3 font-semibold leading-snug wrap-anywhere", className)}
      {...props}
    />
  );
}

function PlannerStickerMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-sticker-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { PlannerSticker, PlannerStickerMeta, PlannerStickerTitle };

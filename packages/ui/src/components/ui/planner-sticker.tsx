import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { childHueContainer } from "../../libs/child-hue-classes";
import { cn } from "../../libs/utils";

const plannerStickerVariants = cva(
  "flex w-full min-w-0 flex-col gap-1.5 rounded-inner border p-block text-small text-foreground outline-none hover:shadow-raised focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      hue: childHueContainer,
    },
  },
);

interface PlannerStickerProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof plannerStickerVariants> {
  asChild?: boolean;
}

function PlannerSticker({ className, hue, asChild = false, ...props }: PlannerStickerProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      className={cn(plannerStickerVariants({ hue }), className)}
      {...props}
      data-slot="planner-sticker"
    />
  );
}

function PlannerStickerTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-sticker-title"
      className={cn("line-clamp-3 font-semibold wrap-anywhere", className)}
      {...props}
    />
  );
}

function PlannerStickerMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="planner-sticker-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-1 text-meta text-muted-foreground [&_svg]:size-icon-sm [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { PlannerSticker, PlannerStickerMeta, PlannerStickerTitle };

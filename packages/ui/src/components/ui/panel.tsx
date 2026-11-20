import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const panelVariants = cva("rounded-inner p-block", {
  variants: {
    tone: {
      default: "bg-surface-container",
      muted: "bg-muted",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

function Panel({
  className,
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof panelVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "div";
  return <Comp data-slot="panel" className={cn(panelVariants({ tone, className }))} {...props} />;
}

export { Panel };

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const hueDotVariants = cva("inline-block size-1.5 shrink-0 rounded-full", {
  variants: {
    hue: {
      1: "bg-child-1-mark",
      2: "bg-child-2-mark",
      3: "bg-child-3-mark",
      4: "bg-child-4-mark",
      5: "bg-child-5-mark",
      6: "bg-child-6-mark",
      7: "bg-child-7-mark",
      8: "bg-child-8-mark",
    },
  },
});

function HueDot({
  className,
  hue,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof hueDotVariants>) {
  return (
    <span
      data-slot="hue-dot"
      aria-hidden
      className={cn(hueDotVariants({ hue }), className)}
      {...props}
    />
  );
}

export { HueDot };

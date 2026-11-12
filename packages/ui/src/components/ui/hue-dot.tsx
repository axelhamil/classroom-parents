import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const hueDotVariants = cva("inline-block size-1.5 shrink-0 rounded-full", {
  variants: {
    hue: {
      1: "bg-child-1",
      2: "bg-child-2",
      3: "bg-child-3",
      4: "bg-child-4",
      5: "bg-child-5",
      6: "bg-child-6",
      7: "bg-child-7",
      8: "bg-child-8",
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

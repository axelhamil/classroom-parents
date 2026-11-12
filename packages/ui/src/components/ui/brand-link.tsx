import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

interface BrandLinkProps extends React.ComponentProps<"a"> {
  asChild?: boolean;
}

function BrandLink({ className, asChild = false, ...props }: BrandLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="brand-link"
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export { BrandLink };

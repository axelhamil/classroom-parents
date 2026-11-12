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
        "inline-flex min-h-touch min-w-0 shrink-0 items-center whitespace-nowrap gap-2.5 rounded-md font-display text-base font-bold tracking-tight outline-none focus-visible:ring focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function BrandMark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="brand-mark"
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 -rotate-3 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm [&>svg]:size-5",
        className,
      )}
      {...props}
    />
  );
}

export { BrandLink, BrandMark };

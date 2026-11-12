import type * as React from "react";
import { cn } from "../../libs/utils";

interface ScrollRegionProps extends Omit<React.ComponentProps<"section">, "aria-label"> {
  label: string;
}

function ScrollRegion({ label, className, ...props }: ScrollRegionProps) {
  return (
    <section
      data-slot="scroll-region"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard, WCAG 2.1.1
      tabIndex={0}
      className={cn(
        "scroll-edges max-h-scroll-region overflow-y-auto rounded-sm outline-none focus-visible:ring focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

export { ScrollRegion };

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../libs/utils";

const scrollRegionVariants = cva(
  "-mx-scroll-gutter rounded-sm px-scroll-gutter outline-none focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      variant: {
        region:
          "scroll-edges -my-scroll-gutter max-h-scroll-region overflow-y-auto py-scroll-gutter",
        panel: "scroll-fade min-h-0",
        list: "scroll-fade min-h-0 max-h-scroll-region",
      },
    },
    defaultVariants: { variant: "region" },
  },
);

interface ScrollRegionProps
  extends Omit<React.ComponentProps<"section">, "aria-label">,
    VariantProps<typeof scrollRegionVariants> {
  label: string;
}

function ScrollRegion({ label, variant, className, ...props }: ScrollRegionProps) {
  return (
    <section
      data-slot="scroll-region"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard, WCAG 2.1.1
      tabIndex={0}
      className={cn(scrollRegionVariants({ variant }), className)}
      {...props}
    />
  );
}

export { ScrollRegion };

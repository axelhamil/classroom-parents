import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * The sections of a page (cards, form fields, the parts of a deadline) spread over the width in
 * as many columns as fit at `--section-min-width` each: one on a phone and a tablet, two from
 * about 1280px, more on a wide screen. Rows read left to right in the DOM order, never a masonry
 * that reorders them, and a lone section takes the whole row instead of leaving columns empty.
 * Why the section decides and not the page: the same grid fills a settings pane, a page and a
 * dialog (one column there) without a breakpoint per place.
 */
function SectionGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-grid"
      className={cn(
        "grid grid-cols-[repeat(auto-fit,minmax(min(100%,var(--section-min-width)),1fr))] items-start gap-surface",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Sections stacked as one column of a `SectionGrid`, for parts of unequal heights that read in
 * order: what comes first fills the first column, the rest the next. Why not one section per
 * cell: a short part beside a tall one leaves a hole under it as tall as the difference, which
 * pushes the next part down the screen.
 */
function SectionColumn({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-column"
      className={cn("flex min-w-0 flex-col gap-surface", className)}
      {...props}
    />
  );
}

export { SectionColumn, SectionGrid };

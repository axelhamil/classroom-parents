import type * as React from "react";

import { cn } from "../../libs/utils";

interface PaletteSwatchProps extends React.ComponentProps<"div"> {
  palette: string;
}

/** A corner of the page drawn in another palette: its children render with that palette's tokens, in the current light or dark mode. Decorative, hidden from assistive technology. */
function PaletteSwatch({ palette, className, ...props }: PaletteSwatchProps) {
  return (
    <div
      data-slot="palette-swatch"
      data-palette={palette}
      aria-hidden
      className={cn(
        "flex rounded-lg border bg-background p-2 text-foreground [&>[data-slot=planner-card]]:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

export { PaletteSwatch };

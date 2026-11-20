import type * as React from "react";

import { cn } from "../../libs/utils";

interface PaletteSwatchProps extends React.ComponentProps<"div"> {
  palette: string;
}

/** A corner of the home drawn in another palette: its children render with that palette's tokens, in the current light or dark mode, on the palette's own page colour. Decorative and inert, hidden from assistive technology. */
function PaletteSwatch({ palette, className, ...props }: PaletteSwatchProps) {
  return (
    <div
      data-slot="palette-swatch"
      data-palette={palette}
      aria-hidden
      className={cn(
        "pointer-events-none flex flex-col gap-2 rounded-inner bg-background p-block text-foreground shadow-rest",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A palette in a few pixels: its page colour, a card and its action colour, enough to tell twelve
 * palettes apart in a grid. Decorative and inert; the name beside it says the palette.
 */
function PaletteChip({ palette, className, ...props }: PaletteSwatchProps) {
  return (
    <div
      data-slot="palette-chip"
      data-palette={palette}
      aria-hidden
      className={cn(
        "pointer-events-none flex h-10 w-full items-end justify-between gap-2 rounded-inner bg-background p-1.5 shadow-rest",
        className,
      )}
      {...props}
    >
      <span className="h-3 flex-1 rounded-full bg-card" />
      <span className="size-4 rounded-full bg-primary" />
    </div>
  );
}

export { PaletteChip, PaletteSwatch };

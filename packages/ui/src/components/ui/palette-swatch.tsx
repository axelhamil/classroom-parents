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
        "pointer-events-none flex flex-col gap-2 rounded-xl border bg-background p-2.5 text-foreground shadow-rest",
        className,
      )}
      {...props}
    />
  );
}

export { PaletteSwatch };

import type * as React from "react";

import { cn } from "../../libs/utils";

interface RollingCountProps extends Omit<React.ComponentProps<"span">, "children"> {
  value: number;
}

/**
 * A count that rolls its new value in from above when it changes, so a figure
 * that moves under the parent's eyes (a period turned, a child filtered) reads
 * as a change rather than a flicker. The keyed digit remounts on every value.
 */
function RollingCount({ className, value, ...props }: RollingCountProps) {
  return (
    <span
      data-slot="rolling-count"
      className={cn("inline-grid overflow-hidden tabular-nums", className)}
      {...props}
    >
      <span key={value}>{value}</span>
    </span>
  );
}

export { RollingCount };

import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../../libs/utils";

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  indeterminate?: boolean;
}

function Progress({ className, value, indeterminate = false, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={indeterminate ? null : value}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
      {...props}
    >
      {indeterminate ? (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full w-2/5 animate-progress-sweep rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60"
        />
      ) : (
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full w-full flex-1 bg-primary transition-transform duration-(--duration-step) ease-(--ease-out-soft)"
          style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  );
}

export { Progress };

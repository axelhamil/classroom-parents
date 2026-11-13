import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../../libs/utils";

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  indeterminate?: boolean;
  tone?: "primary" | "success";
}

function Progress({
  className,
  value,
  max = 100,
  indeterminate = false,
  tone = "primary",
  ...props
}: ProgressProps) {
  const remaining = 100 - ((value || 0) / max) * 100;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-tone={tone}
      value={indeterminate ? null : value}
      max={max}
      className={cn(
        "group/progress relative h-2 w-full shrink-0 overflow-hidden rounded-full bg-primary/20 data-[tone=success]:bg-success/20",
        className,
      )}
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
          className="h-full w-full flex-1 rounded-full bg-primary transition-[transform,background-color] duration-(--duration-slower) ease-(--ease-out-soft) group-data-[tone=success]/progress:bg-success"
          style={{ transform: `translateX(-${remaining}%)` }}
        />
      )}
    </ProgressPrimitive.Root>
  );
}

export { Progress };

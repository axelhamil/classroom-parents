import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../../libs/utils";

const progressVariants = cva(
  "group/progress relative w-full shrink-0 overflow-hidden rounded-full",
  {
    variants: {
      tone: {
        primary: "h-2 bg-progress-track",
        success: "h-2 bg-success/20",
        ink: "h-1.5 bg-progress-track",
      },
    },
    defaultVariants: { tone: "primary" },
  },
);

interface ProgressProps
  extends React.ComponentProps<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants> {
  indeterminate?: boolean;
}

/**
 * The done part wears the action on a neutral track; `success` says it is all
 * done. `ink` is the quiet look for a count of done things, a thinner track:
 * pair it with a `ProgressLegend` the bar names through `aria-describedby`, so
 * an empty bar still reads as "0 of 2".
 */
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
      className={cn(progressVariants({ tone }), className)}
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

/** A bar and the figure that says it, on one line. */
function ProgressRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="progress-row"
      className={cn("flex min-w-0 items-center gap-3 [&>[data-slot=progress]]:shrink", className)}
      {...props}
    />
  );
}

function ProgressLegend({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="progress-legend"
      className={cn("shrink-0 text-meta font-medium text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

export { Progress, ProgressLegend, ProgressRow };

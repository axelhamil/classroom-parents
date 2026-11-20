import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const dateTabVariants = cva(
  "inline-flex w-14 shrink-0 flex-col overflow-hidden rounded-inner border bg-card text-center leading-none text-card-foreground",
  {
    variants: {
      tone: {
        default:
          "shadow-raised [&>[data-part=month]]:bg-primary [&>[data-part=month]]:text-primary-foreground",
        urgent:
          "border-2 border-destructive shadow-raised [&>[data-part=month]]:bg-destructive [&>[data-part=month]]:text-destructive-foreground",
        today:
          "border-2 border-warning-edge shadow-raised [&>[data-part=month]]:bg-warning [&>[data-part=month]]:text-warning-foreground",
        muted:
          "text-muted-foreground [&>[data-part=month]]:bg-muted [&>[data-part=month]]:text-muted-foreground",
      },
      hue: {
        1: "[&>[data-part=month]]:bg-child-1 [&>[data-part=month]]:text-child-foreground",
        2: "[&>[data-part=month]]:bg-child-2 [&>[data-part=month]]:text-child-foreground",
        3: "[&>[data-part=month]]:bg-child-3 [&>[data-part=month]]:text-child-foreground",
        4: "[&>[data-part=month]]:bg-child-4 [&>[data-part=month]]:text-child-foreground",
        5: "[&>[data-part=month]]:bg-child-5 [&>[data-part=month]]:text-child-foreground",
        6: "[&>[data-part=month]]:bg-child-6 [&>[data-part=month]]:text-child-foreground",
        7: "[&>[data-part=month]]:bg-child-7 [&>[data-part=month]]:text-child-foreground",
        8: "[&>[data-part=month]]:bg-child-8 [&>[data-part=month]]:text-child-foreground",
        9: "[&>[data-part=month]]:bg-child-9 [&>[data-part=month]]:text-child-foreground",
        10: "[&>[data-part=month]]:bg-child-10 [&>[data-part=month]]:text-child-foreground",
        11: "[&>[data-part=month]]:bg-child-11 [&>[data-part=month]]:text-child-foreground",
        12: "[&>[data-part=month]]:bg-child-12 [&>[data-part=month]]:text-child-foreground",
        13: "[&>[data-part=month]]:bg-child-13 [&>[data-part=month]]:text-child-foreground",
        14: "[&>[data-part=month]]:bg-child-14 [&>[data-part=month]]:text-child-foreground",
        15: "[&>[data-part=month]]:bg-child-15 [&>[data-part=month]]:text-child-foreground",
        16: "[&>[data-part=month]]:bg-child-16 [&>[data-part=month]]:text-child-foreground",
      },
      size: {
        default: "",
        lg: "w-24 [&>[data-part=month]]:py-1.5 [&>[data-part=month]]:text-small [&>[data-part=day]]:pt-2 [&>[data-part=day]]:text-5xl [&>[data-part=weekday]]:pb-2 [&>[data-part=weekday]]:text-small",
      },
    },
    defaultVariants: { tone: "default", size: "default" },
  },
);

interface DateTabProps
  extends Omit<React.ComponentProps<"time">, "children">,
    VariantProps<typeof dateTabVariants> {
  dateTime: string;
  day: string;
  month: string;
  weekday?: string;
}

/**
 * The tear-off date of the planner, the product's one signature: on every
 * deadline card at the default size, large (`size="lg"`) as the head of a
 * deadline's sheet. The month band takes the child's hue.
 */
function DateTab({
  className,
  tone,
  hue,
  size,
  dateTime,
  day,
  month,
  weekday,
  ...props
}: DateTabProps) {
  return (
    <time
      data-slot="date-tab"
      dateTime={dateTime}
      className={cn(dateTabVariants({ tone, hue, size }), className)}
      {...props}
    >
      <span data-part="month" className="py-1 text-meta font-bold">
        {month}
      </span>
      <span
        data-part="day"
        className="pt-1.5 font-display last:pb-1.5 text-2xl font-bold tabular-nums"
      >
        {day}
      </span>
      {weekday && (
        <span data-part="weekday" className="pb-1.5 text-meta">
          {weekday}
        </span>
      )}
    </time>
  );
}

export { DateTab, dateTabVariants };

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const dateTabVariants = cva(
  "inline-flex w-14 shrink-0 flex-col overflow-hidden rounded-md border bg-card text-center leading-none text-card-foreground shadow-raised",
  {
    variants: {
      tone: {
        default: "[&>[data-part=month]]:bg-primary [&>[data-part=month]]:text-primary-foreground",
        urgent:
          "border-destructive/50 [&>[data-part=month]]:bg-destructive [&>[data-part=month]]:text-destructive-foreground",
        today:
          "border-warning [&>[data-part=month]]:bg-warning [&>[data-part=month]]:text-warning-foreground",
        muted:
          "text-muted-foreground shadow-none [&>[data-part=month]]:bg-muted [&>[data-part=month]]:text-muted-foreground",
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
      },
    },
    defaultVariants: { tone: "default" },
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

function DateTab({ className, tone, hue, dateTime, day, month, weekday, ...props }: DateTabProps) {
  return (
    <time
      data-slot="date-tab"
      dateTime={dateTime}
      className={cn(dateTabVariants({ tone, hue }), className)}
      {...props}
    >
      <span data-part="month" className="py-1 text-xs font-bold">
        {month}
      </span>
      <span
        data-part="day"
        className="pt-1.5 font-display last:pb-1.5 text-2xl font-bold tabular-nums"
      >
        {day}
      </span>
      {weekday && (
        <span data-part="weekday" className="pb-1.5 text-xs">
          {weekday}
        </span>
      )}
    </time>
  );
}

export { DateTab, dateTabVariants };

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const dateTabVariants = cva(
  "inline-flex w-14 shrink-0 flex-col overflow-hidden rounded-md border bg-card text-center leading-none text-card-foreground shadow-sm",
  {
    variants: {
      tone: {
        default: "[&>[data-part=month]]:bg-primary [&>[data-part=month]]:text-primary-foreground",
        urgent:
          "border-destructive/50 [&>[data-part=month]]:bg-destructive [&>[data-part=month]]:text-destructive-foreground",
        muted:
          "text-muted-foreground shadow-none [&>[data-part=month]]:bg-muted [&>[data-part=month]]:text-muted-foreground",
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

function DateTab({ className, tone, dateTime, day, month, weekday, ...props }: DateTabProps) {
  return (
    <time
      data-slot="date-tab"
      dateTime={dateTime}
      className={cn(dateTabVariants({ tone }), className)}
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

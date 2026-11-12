import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const calendarPeriodVariants = cva("flex min-w-0 flex-col gap-6 touch-pan-y", {
  variants: {
    direction: {
      none: "",
      forward: "animate-step-forward",
      back: "animate-step-back",
    },
  },
  defaultVariants: { direction: "none" },
});

interface CalendarPeriodProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof calendarPeriodVariants> {}

function CalendarPeriod({ className, direction, ...props }: CalendarPeriodProps) {
  return (
    <div
      data-slot="calendar-period"
      className={cn(calendarPeriodVariants({ direction }), className)}
      {...props}
    />
  );
}

const calendarDayVariants = cva("flex min-w-0 flex-col gap-2 scroll-mt-24", {
  variants: {
    tone: {
      default: "",
      today:
        "[&>[data-slot=calendar-day-header]]:border-warning [&>[data-slot=calendar-day-header]]:bg-warning/20",
      past: "[&>[data-slot=calendar-day-header]]:text-muted-foreground",
    },
    crunch: {
      true: "[&_[data-slot=calendar-day-crunch]]:inline-flex",
      false: "",
    },
  },
  defaultVariants: { tone: "default", crunch: false },
});

interface CalendarDayProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof calendarDayVariants> {}

function CalendarDay({ className, tone, crunch, ...props }: CalendarDayProps) {
  return (
    <section
      data-slot="calendar-day"
      data-tone={tone ?? "default"}
      className={cn(calendarDayVariants({ tone, crunch }), className)}
      {...props}
    />
  );
}

function CalendarDayHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="calendar-day-header"
      className={cn(
        "flex min-h-touch items-center gap-2 rounded-xl border border-transparent ps-3 pe-1 text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CalendarDayTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="calendar-day-title"
      className={cn("min-w-0 flex-1 truncate text-base font-semibold", className)}
      {...props}
    />
  );
}

function CalendarDayCrunch({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="calendar-day-crunch"
      className={cn(
        "hidden shrink-0 items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-xs font-medium whitespace-nowrap text-warning-foreground [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

function CalendarDayList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul data-slot="calendar-day-list" className={cn("flex flex-col gap-2", className)} {...props} />
  );
}

function CalendarDayEmpty({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="calendar-day-empty"
      className={cn("px-3 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  CalendarDay,
  CalendarDayCrunch,
  CalendarDayEmpty,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayTitle,
  CalendarPeriod,
};

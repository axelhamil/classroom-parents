import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";
import { badgeVariants } from "./badge";

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

function CalendarWeek({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="calendar-week"
      className={cn("@container/week flex min-w-0 flex-col gap-3", className)}
      {...props}
    />
  );
}

const calendarDayVariants = cva(
  "flex min-w-0 scroll-mt-24 flex-col gap-2 rounded-xl outline-none focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      layout: {
        stack: "",
        row: "@xl/week:grid @xl/week:grid-cols-[var(--spacing-day-gutter)_minmax(0,1fr)] @xl/week:items-start @xl/week:gap-x-4 @xl/week:[&>[data-slot=calendar-day-header]]:flex-wrap @xl/week:[&>[data-slot=calendar-day-header]]:py-1 @xl/week:[&_[data-slot=calendar-day-empty]]:order-last @xl/week:[&_[data-slot=calendar-day-empty]]:ms-3 @xl/week:[&>[data-slot=calendar-day-header]:only-child]:col-span-full @xl/week:[&_[data-slot=calendar-day-title]]:basis-day-gutter-title @xl/week:[&_[data-slot=calendar-day-crunch]]:order-last @xl/week:[&>[data-slot=calendar-day-header]:only-child>[data-slot=calendar-day-title]]:grow-0 @3xl/week:[&>[data-slot=calendar-day-list]]:grid @3xl/week:[&>[data-slot=calendar-day-list]]:grid-cols-2",
      },
      tone: {
        default: "",
        today:
          "[&>[data-slot=calendar-day-header]]:border-warning [&>[data-slot=calendar-day-header]]:bg-warning/20",
        past: "[&>[data-slot=calendar-day-header]]:text-muted-foreground",
        overdue:
          "[&>[data-slot=calendar-day-header]]:border-destructive/40 [&>[data-slot=calendar-day-header]]:bg-destructive/10",
      },
      crunch: {
        true: "[&_[data-slot=calendar-day-crunch]]:inline-flex",
        false: "",
      },
    },
    defaultVariants: { layout: "stack", tone: "default", crunch: false },
  },
);

interface CalendarDayProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof calendarDayVariants> {}

function CalendarDay({ className, layout, tone, crunch, ...props }: CalendarDayProps) {
  return (
    <section
      data-slot="calendar-day"
      data-tone={tone ?? "default"}
      className={cn(calendarDayVariants({ layout, tone, crunch }), className)}
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
      className={cn("min-w-0 flex-1 text-base font-semibold text-balance", className)}
      {...props}
    />
  );
}

function CalendarDayCrunch({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="calendar-day-crunch"
      className={cn(badgeVariants({ variant: "urgent" }), "hidden", className)}
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
      className={cn("shrink-0 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CalendarDayNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="calendar-day-note"
      className={cn("px-3 text-xs text-muted-foreground", className)}
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
  CalendarDayNote,
  CalendarDayTitle,
  CalendarPeriod,
  CalendarWeek,
};

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

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

const calendarWeekVariants = cva("min-w-0", {
  variants: {
    arrangement: {
      stack: "@container/week flex flex-col gap-3 [&>[data-quiet=true]+[data-quiet=true]]:-mt-2",
      fil: "flex flex-col [&>*+*]:border-t [&>*+*]:border-border",
      board: [
        "flex items-stretch gap-2 [&>*]:min-w-0 [&>*]:flex-1 [&>[data-folded]]:w-(--day-rail) [&>[data-folded]]:flex-none [&>[data-slot=calendar-weekend]:not(:has(>[data-slot=calendar-day]:not([data-folded])))]:w-(--day-rail) [&>[data-slot=calendar-weekend]:not(:has(>[data-slot=calendar-day]:not([data-folded])))]:flex-none",
        "[&>[data-slot=calendar-weekend]]:pt-0 [&>[data-slot=calendar-weekend]>[data-part=label]]:sticky [&>[data-slot=calendar-weekend]>[data-part=label]]:top-0 [&>[data-slot=calendar-weekend]>[data-part=label]]:z-30 [&>[data-slot=calendar-weekend]>[data-part=label]]:flex [&>[data-slot=calendar-weekend]>[data-part=label]]:h-(--weekend-label-height) [&>[data-slot=calendar-weekend]>[data-part=label]]:items-end [&>[data-slot=calendar-weekend]>[data-part=label]]:bg-surface-weekend [&>[data-slot=calendar-weekend]_[data-slot=calendar-day-mark]]:top-(--weekend-label-height)",
      ],
    },
  },
  defaultVariants: { arrangement: "stack" },
});

interface CalendarWeekProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof calendarWeekVariants> {}

/**
 * The days of one week. `fil` is the phone's single reading column, a hairline between two days;
 * `board` is the open planner of a wider block, one column per school day and the weekend stacked
 * in one, wherever the week puts it. The order of the DOM is always the order of the days.
 */
function CalendarWeek({ className, arrangement, ...props }: CalendarWeekProps) {
  return (
    <div
      data-slot="calendar-week"
      data-arrangement={arrangement ?? "stack"}
      className={cn(calendarWeekVariants({ arrangement }), className)}
      {...props}
    />
  );
}

interface CalendarWeekendProps extends React.ComponentProps<"div"> {
  /** The visible name of the group ("Week-end"), also its accessible name. */
  label: string;
}

/** Saturday and Sunday stacked on a lighter paper, named by a visible label, in the thread and on the board alike. */
function CalendarWeekend({ className, label, children, ...props }: CalendarWeekendProps) {
  const labelId = React.useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-slot="calendar-weekend"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-inner bg-surface-weekend pt-2 [&>[data-slot=calendar-day]:not([data-tone=today])]:bg-surface-weekend",
        className,
      )}
      {...props}
    >
      <p
        id={labelId}
        data-part="label"
        className="px-2 text-small font-semibold text-muted-foreground"
      >
        {label}
      </p>
      {children}
    </div>
  );
}

/**
 * The strip of the seven days on a phone: it sticks under the app bar while the thread scrolls,
 * and the dates of the thread stick under it. Holds the day picker.
 */
function CalendarDayStrip({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="calendar-day-strip"
      className={cn(
        "sticky top-[calc(var(--spacing-app-bar)+env(safe-area-inset-top))] z-20 flex h-day-strip items-center bg-background",
        className,
      )}
      {...props}
    />
  );
}

const calendarDayVariants = cva(
  "flex min-w-0 scroll-mt-24 flex-col gap-2 rounded-inner outline-none focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      layout: {
        stack: "",
        rail: "grid scroll-mt-day-strip grid-cols-[var(--spacing-day-rail)_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-none py-3 data-[quiet=true]:py-2 [&>:not([data-slot=calendar-day-mark])]:col-start-2",
        column:
          "gap-1.5 rounded-inner bg-card pb-2 [&_[data-slot=calendar-entry-link]]:scroll-mt-12 [&>[data-slot=calendar-day-mark]]:px-1 [&>[data-slot=calendar-day-note]]:px-1 data-[tone=past]:text-muted-foreground data-[tone=today]:bg-today-column",
        row: "@xl/week:grid @xl/week:grid-cols-[var(--spacing-day-gutter)_minmax(0,1fr)] @xl/week:items-start @xl/week:gap-x-4 @xl/week:[&>[data-slot=calendar-day-header]]:flex-wrap @xl/week:[&>[data-slot=calendar-day-header]]:py-1 @xl/week:[&_[data-slot=calendar-day-empty]]:order-last @xl/week:[&_[data-slot=calendar-day-empty]]:ms-3 @xl/week:[&>[data-slot=calendar-day-header]:only-child]:col-span-full @xl/week:[&_[data-slot=calendar-day-title]]:basis-day-gutter-title @xl/week:[&_[data-slot=calendar-day-crunch]]:order-last @xl/week:[&>[data-slot=calendar-day-header]:only-child>[data-slot=calendar-day-title]]:grow-0",
      },
      tone: {
        default: "",
        today:
          "[&>[data-slot=calendar-day-header]]:border-warning-edge [&>[data-slot=calendar-day-header]]:bg-warning/20",
        past: "[&>[data-slot=calendar-day-header]]:text-muted-foreground",
      },
      crunch: {
        true: "[&_[data-slot=calendar-day-crunch]]:inline-flex",
        false: "",
      },
      quiet: {
        true: "[&>[data-slot=calendar-day-header]]:min-h-control-sm [&_[data-slot=calendar-day-title]]:text-small [&_[data-slot=calendar-day-title]]:font-medium",
        false: "",
      },
    },
    defaultVariants: { layout: "stack", tone: "default", crunch: false, quiet: false },
  },
);

interface CalendarDayProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof calendarDayVariants> {}

/**
 * One day of the planner. A `quiet` day (nothing due) folds to a thin line,
 * and quiet days in a row sit close together, so a free weekend takes the
 * room of one busy day instead of four.
 */
function CalendarDay({ className, layout, tone, crunch, quiet, ...props }: CalendarDayProps) {
  return (
    <section
      data-slot="calendar-day"
      data-layout={layout ?? "stack"}
      data-tone={tone ?? "default"}
      data-quiet={quiet ?? false}
      className={cn("group/day", calendarDayVariants({ layout, tone, crunch, quiet }), className)}
      {...props}
    />
  );
}

/**
 * The date of a `rail` or `column` day, its heading: the short weekday and the day number are
 * what the eye reads (`aria-hidden` parts), the full date is the heading's name (an `sr-only`
 * part). On a rail it sticks under the strip of days while its deadlines scroll; on a column it
 * sticks at the top of the planner. Today's number sits in a pill of ink.
 */
function CalendarDayMark({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="calendar-day-mark"
      className={cn(
        "z-10 flex text-foreground group-data-[tone=past]/day:text-muted-foreground",
        "[&>[data-part=day]]:inline-grid [&>[data-part=day]]:place-items-center [&>[data-part=day]]:rounded-full [&>[data-part=day]]:font-display [&>[data-part=day]]:font-bold [&>[data-part=day]]:tabular-nums",
        "group-data-[tone=today]/day:[&>[data-part=day]]:bg-primary group-data-[tone=today]/day:[&>[data-part=day]]:text-primary-foreground",
        "[&>[data-part=weekday]]:text-small [&>[data-part=weekday]]:font-semibold [&>[data-part=weekday]]:text-muted-foreground group-data-[tone=today]/day:[&>[data-part=weekday]]:text-foreground",
        "group-data-[layout=rail]/day:sticky group-data-[layout=rail]/day:top-[calc(var(--spacing-app-bar)+var(--spacing-day-strip)+env(safe-area-inset-top))] group-data-[layout=rail]/day:row-span-full group-data-[layout=rail]/day:flex-col group-data-[layout=rail]/day:items-center group-data-[layout=rail]/day:self-start",
        "group-data-[layout=rail]/day:[&>[data-part=day]]:min-w-10 group-data-[layout=rail]/day:[&>[data-part=day]]:h-10 group-data-[layout=rail]/day:[&>[data-part=day]]:px-1 group-data-[layout=rail]/day:[&>[data-part=day]]:text-2xl",
        "group-data-[quiet=true]/day:[&>[data-part=day]]:h-7 group-data-[quiet=true]/day:[&>[data-part=day]]:text-body group-data-[quiet=true]/day:[&>[data-part=day]]:whitespace-nowrap group-data-[quiet=true]/day:[&>[data-part=day]]:text-muted-foreground group-data-[quiet=true]/day:[&>[data-part=weekday]]:text-meta",
        "group-data-[layout=column]/day:sticky group-data-[layout=column]/day:z-20 group-data-[layout=column]/day:top-0 group-data-[layout=column]/day:flex-wrap group-data-[layout=column]/day:items-baseline group-data-[layout=column]/day:gap-1.5 group-data-[layout=column]/day:border-b group-data-[layout=column]/day:border-border group-data-[layout=column]/day:bg-inherit group-data-[layout=column]/day:px-0.5 group-data-[layout=column]/day:pt-1 group-data-[layout=column]/day:pb-1.5",
        "group-data-[layout=column]/day:[&>[data-part=day]]:min-w-7 group-data-[layout=column]/day:[&>[data-part=day]]:px-1 group-data-[layout=column]/day:[&>[data-part=day]]:text-xl",
        className,
      )}
      {...props}
    />
  );
}

/** The one line under a day's mark: its relative word ("Demain") and, on a full day, its count. */
function CalendarDayNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="calendar-day-note"
      className={cn(
        "flex min-h-6 min-w-0 flex-wrap items-center gap-2 text-small text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CalendarDayHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="calendar-day-header"
      className={cn(
        "flex min-h-control items-center gap-2 rounded-inner border-2 border-transparent ps-3 pe-1 text-foreground",
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
      className={cn("min-w-0 flex-1 text-heading text-balance", className)}
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
      className={cn("shrink-0 text-small text-muted-foreground", className)}
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
  CalendarDayMark,
  CalendarDayNote,
  CalendarDayStrip,
  CalendarDayTitle,
  CalendarPeriod,
  CalendarWeek,
  CalendarWeekend,
};

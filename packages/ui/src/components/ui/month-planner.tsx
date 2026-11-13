"use client";

import * as React from "react";
import { type DayButtonProps, getDefaultClassNames } from "react-day-picker";
import { cn } from "../../libs/utils";
import { Calendar } from "./calendar";

const DayContentContext = React.createContext<(date: Date) => React.ReactNode>(() => null);

function MonthPlannerDayButton({ className, day, modifiers, children, ...props }: DayButtonProps) {
  const dayContent = React.useContext(DayContentContext);
  const ref = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      type="button"
      data-slot="month-planner-day"
      data-today={modifiers.today || undefined}
      data-selected={modifiers.selected || undefined}
      data-outside={modifiers.outside || undefined}
      data-crunch={modifiers.crunch || undefined}
      className={cn(
        "flex size-full min-h-14 flex-col items-center gap-1 rounded-lg border border-transparent p-1 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring focus-visible:ring-ring has-data-[slot=month-planner-chips]:min-h-28 has-data-[slot=month-planner-chips]:items-stretch has-data-[slot=month-planner-chips]:p-1.5 has-data-[slot=month-planner-chips]:[&>[data-slot=month-planner-number]]:self-start",
        "data-[outside]:text-muted-foreground data-[today]:border-warning data-[crunch]:not-data-[selected]:bg-warning/30 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:[&_[data-slot=month-planner-more]]:text-primary-foreground data-[selected]:[&_[data-slot=hue-dot]]:ring-1 data-[selected]:[&_[data-slot=hue-dot]]:ring-primary-foreground",
        className,
      )}
      {...props}
    >
      <span data-slot="month-planner-number" className="font-semibold tabular-nums">
        {children}
      </span>
      {dayContent(day.date)}
    </button>
  );
}

function MonthPlannerDots({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="month-planner-dots"
      aria-hidden
      className={cn("flex h-1.5 items-center gap-0.5", className)}
      {...props}
    />
  );
}

function MonthPlannerChips({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="month-planner-chips"
      aria-hidden
      className={cn("flex w-full min-w-0 flex-col gap-0.5", className)}
      {...props}
    />
  );
}

const chipHues = {
  1: "bg-child-1-container",
  2: "bg-child-2-container",
  3: "bg-child-3-container",
  4: "bg-child-4-container",
  5: "bg-child-5-container",
  6: "bg-child-6-container",
  7: "bg-child-7-container",
  8: "bg-child-8-container",
} as const;

interface MonthPlannerChipProps extends React.ComponentProps<"span"> {
  hue: keyof typeof chipHues;
  done?: boolean;
}

function MonthPlannerChip({ className, hue, done = false, ...props }: MonthPlannerChipProps) {
  return (
    <span
      data-slot="month-planner-chip"
      data-done={done || undefined}
      className={cn(
        "truncate rounded-sm px-1.5 py-0.5 text-left text-xs text-foreground data-[done]:line-through",
        chipHues[hue],
        className,
      )}
      {...props}
    />
  );
}

function MonthPlannerMore({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="month-planner-more"
      className={cn("text-left text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

interface MonthPlannerProps
  extends Omit<
    React.ComponentProps<typeof Calendar>,
    "mode" | "selected" | "onSelect" | "required" | "components" | "classNames"
  > {
  selected: Date;
  onSelect: (date: Date) => void;
  dayContent: (date: Date) => React.ReactNode;
}

function MonthPlanner({ selected, onSelect, dayContent, className, ...props }: MonthPlannerProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayContentContext.Provider value={dayContent}>
      <Calendar
        mode="single"
        required
        selected={selected}
        onSelect={onSelect}
        fixedWeeks
        hideNavigation
        className={cn("w-full bg-transparent p-0", className)}
        classNames={{
          root: cn("w-full", defaults.root),
          months: cn("flex flex-col", defaults.months),
          month: cn("flex w-full flex-col gap-2", defaults.month),
          month_caption: cn("sr-only", defaults.month_caption),
          month_grid: cn("w-full border-collapse", defaults.month_grid),
          weekdays: cn("grid grid-cols-7", defaults.weekdays),
          weekday: cn(
            "pb-1 text-xs font-medium text-muted-foreground capitalize",
            defaults.weekday,
          ),
          week: cn("grid grid-cols-7 gap-1 pt-1", defaults.week),
          day: cn("min-w-0 p-0", defaults.day),
          today: defaults.today,
          outside: defaults.outside,
          selected: defaults.selected,
        }}
        components={{ DayButton: MonthPlannerDayButton }}
        {...props}
      />
    </DayContentContext.Provider>
  );
}

export { MonthPlanner, MonthPlannerChip, MonthPlannerChips, MonthPlannerDots, MonthPlannerMore };

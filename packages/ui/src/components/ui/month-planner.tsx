"use client";

import * as React from "react";
import { type DayButtonProps, getDefaultClassNames } from "react-day-picker";
import { type ChildTone, childHueContainer } from "../../libs/child-hue-classes";
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
      aria-current={modifiers.today ? "date" : undefined}
      className={cn(
        "flex size-full min-h-11 group-data-[density=planner]/planner:min-h-14 flex-col items-center gap-1 rounded-lg border border-transparent p-1 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring focus-visible:ring-ring has-data-[slot=month-planner-chips]:min-h-28 has-data-[slot=month-planner-chips]:items-stretch has-data-[slot=month-planner-chips]:p-1.5 has-data-[slot=month-planner-chips]:[&>[data-slot=month-planner-number]]:self-start",
        "data-[outside]:text-muted-foreground data-[today]:[&>[data-slot=month-planner-number]]:bg-primary data-[today]:[&>[data-slot=month-planner-number]]:text-primary-foreground data-[selected]:data-[today]:[&>[data-slot=month-planner-number]]:bg-primary-foreground data-[selected]:data-[today]:[&>[data-slot=month-planner-number]]:text-primary group-data-[density=planner]/planner:data-[crunch]:not-data-[selected]:bg-warning/30 data-[crunch]:[&_[data-slot=month-planner-count]]:bg-warning data-[crunch]:[&_[data-slot=month-planner-count]]:text-warning-foreground data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:[&_[data-slot=month-planner-more]]:text-primary-foreground data-[selected]:[&_[data-slot=hue-dot]]:ring-1 data-[selected]:[&_[data-slot=hue-dot]]:ring-primary-foreground",
        className,
      )}
      {...props}
    >
      <span
        data-slot="month-planner-number"
        className="inline-grid h-6 min-w-6 place-items-center rounded-full px-1 font-semibold tabular-nums"
      >
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

/** How many deadlines fall that day, in figures: the eye counts digits faster than dots. Hidden from assistive tech, the cell's name says it. */
function MonthPlannerCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="month-planner-count"
      aria-hidden
      className={cn(
        "min-w-5 rounded-full px-1 text-center text-xs font-semibold tabular-nums text-muted-foreground",
        className,
      )}
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

interface MonthPlannerChipProps extends React.ComponentProps<"span"> {
  hue: ChildTone;
  done?: boolean;
}

function MonthPlannerChip({ className, hue, done = false, ...props }: MonthPlannerChipProps) {
  return (
    <span
      data-slot="month-planner-chip"
      data-done={done || undefined}
      className={cn(
        "truncate rounded-sm px-1.5 py-0.5 text-left text-xs text-foreground data-[done]:line-through",
        childHueContainer[hue],
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
  /** `compact` fits a tile: a count per day beside the panel of the chosen day. `planner` is the full page: chips of deadlines in every cell. */
  density?: "compact" | "planner";
}

function MonthPlanner({
  selected,
  onSelect,
  dayContent,
  density = "compact",
  className,
  ...props
}: MonthPlannerProps) {
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
        data-density={density}
        className={cn("group/planner w-full bg-transparent p-0", className)}
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

export {
  MonthPlanner,
  MonthPlannerChip,
  MonthPlannerChips,
  MonthPlannerCount,
  MonthPlannerDots,
  MonthPlannerMore,
};

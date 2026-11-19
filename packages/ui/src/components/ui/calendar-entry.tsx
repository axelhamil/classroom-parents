import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const calendarEntryVariants = cva(
  "relative flex w-full min-w-0 items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-foreground has-[[data-slot=calendar-entry-link]:focus-visible]:ring has-[[data-slot=calendar-entry-link]:focus-visible]:ring-ring [&>[data-slot=checkbox]]:relative [&>[data-slot=checkbox]]:z-10 [&>[data-slot=checkbox]]:mt-0.5 [&>[data-slot=checkbox][data-state=unchecked]]:bg-card",
  {
    variants: {
      hue: {
        1: "bg-child-1-container",
        2: "bg-child-2-container",
        3: "bg-child-3-container",
        4: "bg-child-4-container",
        5: "bg-child-5-container",
        6: "bg-child-6-container",
        7: "bg-child-7-container",
        8: "bg-child-8-container",
      },
      surface: {
        tint: "",
        paper: "bg-surface-container",
      },
      state: {
        open: "",
        overdue: "border-destructive/60",
        urgent: "border-warning",
        done: "text-muted-foreground [&_[data-slot=calendar-entry-link]]:line-through",
      },
      density: {
        comfortable: "",
        compact: "gap-2 px-2 py-1.5 [&_[data-slot=calendar-entry-link]]:line-clamp-3",
      },
    },
    compoundVariants: [
      {
        surface: "paper",
        hue: 1,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-1)]",
      },
      {
        surface: "paper",
        hue: 2,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-2)]",
      },
      {
        surface: "paper",
        hue: 3,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-3)]",
      },
      {
        surface: "paper",
        hue: 4,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-4)]",
      },
      {
        surface: "paper",
        hue: 5,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-5)]",
      },
      {
        surface: "paper",
        hue: 6,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-6)]",
      },
      {
        surface: "paper",
        hue: 7,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-7)]",
      },
      {
        surface: "paper",
        hue: 8,
        className: "bg-surface-container shadow-[inset_0.1875rem_0_0_var(--child-8)]",
      },
    ],
    defaultVariants: { surface: "tint", state: "open", density: "comfortable" },
  },
);

/**
 * One deadline of the agenda. `surface="tint"` fills it with its child's hue, which tells two
 * children apart; `surface="paper"` is the neutral card of a family with one child, whose hue
 * only remains as an edge on the leading side. A border marks a state (urgent, overdue), never
 * decoration.
 */
interface CalendarEntryProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof calendarEntryVariants> {
  asChild?: boolean;
}

function CalendarEntry({
  className,
  hue,
  surface,
  state,
  density,
  asChild = false,
  ...props
}: CalendarEntryProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="calendar-entry"
      data-state={state ?? "open"}
      data-surface={surface ?? "tint"}
      className={cn(calendarEntryVariants({ hue, surface, state, density }), className)}
      {...props}
    />
  );
}

function CalendarEntryBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="calendar-entry-body"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}

interface CalendarEntryLinkProps extends React.ComponentProps<"a"> {
  asChild?: boolean;
}

function CalendarEntryLink({ className, asChild = false, ...props }: CalendarEntryLinkProps) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="calendar-entry-link"
      className={cn(
        "font-semibold leading-snug hyphens-auto wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']",
        className,
      )}
      {...props}
    />
  );
}

function CalendarEntryMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="calendar-entry-meta"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { CalendarEntry, CalendarEntryBody, CalendarEntryLink, CalendarEntryMeta };

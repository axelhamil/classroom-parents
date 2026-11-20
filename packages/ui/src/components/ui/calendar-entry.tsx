import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { CHILD_TONES, childHueContainer, childHueEdge } from "../../libs/child-hue-classes";
import { cn } from "../../libs/utils";

const PAPERS: ("paper" | "urgent" | "overdue")[] = ["paper", "urgent", "overdue"];

const calendarEntryVariants = cva(
  "relative flex w-full min-w-0 items-start gap-3 rounded-inner border p-block text-small text-foreground has-[[data-slot=calendar-entry-link]:focus-visible]:ring has-[[data-slot=calendar-entry-link]:focus-visible]:ring-ring [&>[data-slot=checkbox]]:relative [&>[data-slot=checkbox]]:z-10 [&>[data-slot=checkbox]]:mt-0.5 [&>[data-slot=checkbox][data-state=unchecked]]:bg-card",
  {
    variants: {
      hue: childHueContainer,
      surface: {
        tint: "",
        paper: "bg-surface-container",
        urgent: "bg-paper-urgent",
        overdue: "bg-paper-overdue",
      },
      state: {
        open: "",
        overdue: "",
        urgent: "",
        done: "text-muted-foreground [&_[data-slot=calendar-entry-link]]:line-through",
      },
      density: {
        comfortable: "",
        compact:
          "flex-wrap gap-2 px-2 py-2 [&>[data-slot=calendar-entry-body]]:basis-full [&>[data-slot=checkbox]]:order-last",
      },
    },
    compoundVariants: CHILD_TONES.map((hue) => ({
      surface: PAPERS,
      hue,
      className: childHueEdge[hue],
    })),
    defaultVariants: { surface: "tint", state: "open", density: "comfortable" },
  },
);

/**
 * One deadline of the agenda. `surface="tint"` fills it with its child's hue, which tells two
 * children apart; `surface="paper"` is the neutral card of a family with one child, whose hue
 * only remains as an edge on the leading side, and `urgent` or `overdue` is that paper breathed
 * with its badge's colour. The child's edge is the card's only coloured edge: its border is the
 * neutral hairline, since a state drawn on the same edge reads as a bug.
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
        "font-semibold hyphens-auto wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-inner after:content-['']",
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
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground [&_svg]:size-icon-sm [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { CalendarEntry, CalendarEntryBody, CalendarEntryLink, CalendarEntryMeta };

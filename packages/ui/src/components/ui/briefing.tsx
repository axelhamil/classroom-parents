import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

function Briefing({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="briefing"
      className={cn(
        "@container/briefing flex min-w-0 flex-col gap-3 rounded-2xl bg-surface-container p-4 text-foreground [--scroll-fade-surface:var(--surface-container)]",
        className,
      )}
      {...props}
    />
  );
}

function BriefingTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="briefing-title"
      className={cn(
        "font-display text-2xl leading-tight font-bold tracking-tight text-balance wrap-anywhere",
        className,
      )}
      {...props}
    />
  );
}

const briefingSummaryVariants = cva(
  "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground",
  {
    variants: {
      tone: {
        default: "",
        ready: "font-medium text-foreground",
      },
      arrive: {
        true: "motion-safe:animate-rise-in",
        false: "[&>[data-slot=celebration-stamp]]:animate-none",
      },
    },
    defaultVariants: { tone: "default", arrive: false },
  },
);

interface BriefingSummaryProps
  extends React.ComponentProps<"p">,
    VariantProps<typeof briefingSummaryVariants> {}

function BriefingSummary({ className, tone, arrive, ...props }: BriefingSummaryProps) {
  return (
    <p
      data-slot="briefing-summary"
      data-tone={tone ?? "default"}
      className={cn(briefingSummaryVariants({ tone, arrive }), className)}
      {...props}
    />
  );
}

function BriefingGroups({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="briefing-groups"
      className={cn(
        "grid min-w-0 grid-cols-1 items-start gap-3 @2xl/briefing:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))]",
        className,
      )}
      {...props}
    />
  );
}

function BriefingGroup({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="briefing-group"
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground",
        className,
      )}
      {...props}
    />
  );
}

function BriefingGroupHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="briefing-group-header"
      className={cn("flex min-w-0 items-center gap-3 pb-1", className)}
      {...props}
    />
  );
}

function BriefingGroupTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="briefing-group-title"
      className={cn("min-w-0 flex-1 text-base font-semibold wrap-anywhere", className)}
      {...props}
    />
  );
}

function BriefingList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="briefing-list"
      className={cn("flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

function BriefingItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="briefing-item"
      className={cn("flex min-w-0 flex-col gap-1 [&>[data-slot=checklist]]:ps-6", className)}
      {...props}
    />
  );
}

export {
  Briefing,
  BriefingGroup,
  BriefingGroupHeader,
  BriefingGroups,
  BriefingGroupTitle,
  BriefingItem,
  BriefingList,
  BriefingSummary,
  BriefingTitle,
};

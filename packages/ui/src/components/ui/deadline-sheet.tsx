import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const deadlineCategoryVariants = cva(
  "inline-flex min-w-0 items-center gap-1.5 font-semibold [&>svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "text-sm [&>svg]:size-4",
        xs: "gap-1 text-xs [&>svg]:size-3.5",
      },
      tone: {
        assessment: "text-category-assessment",
        homework: "text-category-homework",
        schoolTrip: "text-category-school-trip",
        swimming: "text-category-swimming",
        documentDue: "text-category-document-due",
        other: "text-muted-foreground",
      },
    },
    defaultVariants: { tone: "other", size: "sm" },
  },
);

interface DeadlineCategoryProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof deadlineCategoryVariants> {}

/**
 * What kind of deadline it is: an icon and a word in the ink of its
 * category, never a tinted pill, so it never competes with the child's
 * color the card already carries.
 */
function DeadlineCategory({ className, tone, size, ...props }: DeadlineCategoryProps) {
  return (
    <span
      data-slot="deadline-category"
      className={cn(deadlineCategoryVariants({ tone, size }), className)}
      {...props}
    />
  );
}

/**
 * The line above a deadline's title. Its children flow inline, so the line
 * follows the alignment of the header it sits in (centred in a phone
 * drawer, left on larger screens).
 */
function DeadlineEyebrow({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="deadline-eyebrow"
      className={cn("block min-w-0 [&>*]:align-middle [&>*+*]:ms-2", className)}
      {...props}
    />
  );
}

/**
 * Who the deadline is for and where it came from, as one sentence after the
 * child's avatar. Inline, so it can sit inside a header's description
 * paragraph.
 */
function DeadlineOrigin({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="deadline-origin"
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-2 align-middle text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * When a deadline is due, as the head of its sheet: the large tear-off date
 * beside the day in words and the time. Amber only comes from the urgency
 * badge inside it.
 */
function DeadlineHero({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="deadline-hero"
      className={cn("flex min-w-0 items-center gap-4", className)}
      {...props}
    />
  );
}

function DeadlineHeroBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="deadline-hero-body"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function DeadlineHeroDay({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="deadline-hero-day"
      className={cn(
        "font-display text-3xl leading-tight font-bold tracking-tight text-balance",
        className,
      )}
      {...props}
    />
  );
}

function DeadlineHeroDate({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="deadline-hero-date"
      className={cn(
        "text-base font-medium text-muted-foreground tabular-nums first-letter:uppercase",
        className,
      )}
      {...props}
    />
  );
}

function DeadlineHeroMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="deadline-hero-meta"
      className={cn("flex min-w-0 flex-wrap items-center gap-2 pt-1 empty:hidden", className)}
      {...props}
    />
  );
}

/**
 * Secondary actions of a deadline on one row of equal tiles, so three of
 * them never wrap on a phone.
 */
function DeadlineActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="deadline-actions"
      className={cn("grid auto-cols-fr grid-flow-col gap-2", className)}
      {...props}
    />
  );
}

/**
 * The words of the source (the teacher's announcement) quoted as they were
 * written, on a muted sheet, at a reading measure.
 */
function DeadlineQuote({ className, ...props }: React.ComponentProps<"blockquote">) {
  return (
    <blockquote
      data-slot="deadline-quote"
      className={cn(
        "max-w-prose rounded-xl bg-surface-container p-4 text-base leading-relaxed whitespace-pre-line wrap-anywhere text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Housekeeping of a deadline (edit, delete), set apart from what the parent
 * does with it.
 */
function DeadlineFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="deadline-footer"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4",
        className,
      )}
      {...props}
    />
  );
}

export {
  DeadlineActions,
  DeadlineCategory,
  DeadlineEyebrow,
  DeadlineFooter,
  DeadlineHero,
  DeadlineHeroBody,
  DeadlineHeroDate,
  DeadlineHeroDay,
  DeadlineHeroMeta,
  DeadlineOrigin,
  DeadlineQuote,
};

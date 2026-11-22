import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const typographyH1Variants = cva("scroll-m-20 font-display text-display", {
  variants: {
    variant: {
      hero: "text-center text-balance",
      page: "text-left",
    },
  },
  defaultVariants: { variant: "hero" },
});

interface TypographyH1Props
  extends React.ComponentProps<"h1">,
    VariantProps<typeof typographyH1Variants> {}

function TypographyH1({ className, variant, ...props }: TypographyH1Props) {
  return (
    <h1
      data-slot="typography-h1"
      className={cn(typographyH1Variants({ variant }), className)}
      {...props}
    />
  );
}

const typographyH2Variants = cva("scroll-m-20 first:mt-0", {
  variants: {
    variant: {
      default: "font-display text-title",
      section: "text-heading",
    },
    tone: {
      default: "",
      destructive: "text-destructive",
    },
  },
  defaultVariants: { variant: "default", tone: "default" },
});

interface TypographyH2Props
  extends React.ComponentProps<"h2">,
    VariantProps<typeof typographyH2Variants> {}

function TypographyH2({ className, variant, tone, ...props }: TypographyH2Props) {
  return (
    <h2
      data-slot="typography-h2"
      className={cn(typographyH2Variants({ variant, tone }), className)}
      {...props}
    />
  );
}

function TypographyH3({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="typography-h3"
      className={cn("scroll-m-20 font-display text-title", className)}
      {...props}
    />
  );
}

function TypographyH4({ className, ...props }: React.ComponentProps<"h4">) {
  return (
    <h4
      data-slot="typography-h4"
      className={cn("scroll-m-20 text-heading", className)}
      {...props}
    />
  );
}

function TypographyP({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="typography-p" className={cn("text-body", className)} {...props} />;
}

function TypographyLead({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-lead"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

function TypographyLarge({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="typography-large"
      className={cn("font-display text-title", className)}
      {...props}
    />
  );
}

function TypographySmall({ className, ...props }: React.ComponentProps<"small">) {
  return (
    <small
      data-slot="typography-small"
      className={cn("text-small font-medium", className)}
      {...props}
    />
  );
}

function TypographyMuted({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="typography-muted"
      className={cn("text-muted-foreground text-small", className)}
      {...props}
    />
  );
}

/**
 * Running text at its reading measure, about 70 characters a line: its paragraphs, lists,
 * headings, quotes and alerts stop at `max-w-measure`, while a table inside keeps the page's
 * width. Why the text block and not the page: the page still spans the screen (its header, its
 * tables, its columns of sections), only the lines the eye follows stay short. It draws no box
 * (`display: contents`), so its children stay in the flow of their parent.
 */
function ReadingText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="reading-text"
      className={cn(
        "contents [&_:is(p,ul,ol,h2,h3,h4,blockquote,[data-slot=alert])]:max-w-measure",
        className,
      )}
      {...props}
    />
  );
}

const typographyInlineVariants = cva("", {
  variants: {
    tone: {
      default: "",
      muted: "text-muted-foreground",
      destructive: "text-destructive",
    },
    font: {
      sans: "",
      mono: "font-mono",
    },
    size: {
      inherit: "",
      sm: "text-small",
      xs: "text-meta",
    },
    weight: {
      inherit: "",
      medium: "font-medium",
      semibold: "font-semibold",
    },
  },
  defaultVariants: { tone: "default", font: "sans", size: "inherit", weight: "inherit" },
});

interface TypographyInlineProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof typographyInlineVariants> {}

/**
 * Phrasing text where a block paragraph is not allowed or not wanted: inside a
 * `summary`, a table cell, a title or next to other inline content. Size
 * inherits from the parent unless set; `mono` is for identifiers (event
 * types, token prefixes, URLs), without the inline code chip.
 */
function TypographyInline({
  className,
  tone,
  font,
  size,
  weight,
  ...props
}: TypographyInlineProps) {
  return (
    <span
      data-slot="typography-inline"
      className={cn(typographyInlineVariants({ tone, font, size, weight }), className)}
      {...props}
    />
  );
}

/**
 * A title set in the display face where the heading element is owned by a
 * primitive (a sheet or drawer title): the element keeps its role, the
 * words take the display scale.
 */
function TypographyDisplay({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="typography-display"
      className={cn("block font-display text-display text-balance", className)}
      {...props}
    />
  );
}

function TypographyBlockquote({ className, ...props }: React.ComponentProps<"blockquote">) {
  return (
    <blockquote
      data-slot="typography-blockquote"
      className={cn("mt-6 border-l-2 pl-6 italic", className)}
      {...props}
    />
  );
}

function TypographyInlineCode({ className, ...props }: React.ComponentProps<"code">) {
  return (
    <code
      data-slot="typography-inline-code"
      className={cn(
        "relative rounded-mark bg-muted px-1 py-0.5 font-mono font-medium text-small",
        className,
      )}
      {...props}
    />
  );
}

function TypographyList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="typography-list"
      className={cn("ml-6 list-disc [&>li]:mt-2", className)}
      {...props}
    />
  );
}

function TypographyOrderedList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="typography-ordered-list"
      className={cn("ml-6 list-decimal [&>li]:mt-2", className)}
      {...props}
    />
  );
}

export {
  ReadingText,
  TypographyBlockquote,
  TypographyDisplay,
  TypographyH1,
  TypographyH2,
  TypographyH3,
  TypographyH4,
  TypographyInline,
  TypographyInlineCode,
  TypographyLarge,
  TypographyLead,
  TypographyList,
  TypographyMuted,
  TypographyOrderedList,
  TypographyP,
  TypographySmall,
};

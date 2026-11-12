import type * as React from "react";

import { cn } from "../../libs/utils";

function StepList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="step-list"
      className={cn("flex flex-col gap-6 [counter-reset:step]", className)}
      {...props}
    />
  );
}

function StepListItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="step-list-item"
      className={cn(
        "relative flex flex-1 gap-4 [counter-increment:step] before:flex before:size-11 before:shrink-0 before:items-center before:justify-center before:rounded-full before:bg-primary before:font-display before:text-lg before:font-bold before:text-primary-foreground before:content-[counter(step)] after:absolute after:top-12 after:-bottom-5 after:left-5.25 after:w-0.5 after:rounded-full after:bg-border last:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

function StepListContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="step-list-content"
      className={cn("flex min-w-0 flex-col gap-1 pt-2", className)}
      {...props}
    />
  );
}

function StepListTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="step-list-title"
      className={cn("font-display text-lg leading-snug font-semibold text-balance", className)}
      {...props}
    />
  );
}

function StepListDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="step-list-description"
      className={cn("text-muted-foreground text-pretty", className)}
      {...props}
    />
  );
}

export { StepList, StepListContent, StepListDescription, StepListItem, StepListTitle };

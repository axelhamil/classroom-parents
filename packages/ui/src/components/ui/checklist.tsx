import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * `compact` is the steps of a deadline inside its card: a quieter, smaller
 * list aligned on the title column, lifted above the card's stretched title
 * link so every step stays its own control, never nested in the link.
 */
const checklistVariants = cva("flex flex-col", {
  variants: {
    density: {
      default: "",
      compact: "relative z-10",
    },
  },
  defaultVariants: { density: "default" },
});

const checklistItemVariants = cva(
  "flex min-w-0 items-center rounded-inner has-data-[state=checked]:text-muted-foreground [&>label]:min-w-0 [&>label]:flex-1 [&>label]:cursor-pointer [&>label]:font-normal [&>label]:wrap-anywhere has-data-[state=checked]:[&>label]:line-through",
  {
    variants: {
      density: {
        default: "min-h-control gap-3 px-2 hover:bg-accent [&>label]:py-2 [&>label]:text-body",
        compact:
          "min-h-control-sm gap-2 text-muted-foreground [&>[data-slot=checkbox][data-state=unchecked]]:bg-card [&>label]:py-1 [&>label]:text-small",
      },
    },
    defaultVariants: { density: "default" },
  },
);

type ChecklistDensity = VariantProps<typeof checklistVariants>["density"];

interface ChecklistProps extends React.ComponentProps<"ul"> {
  density?: ChecklistDensity;
}

function Checklist({ className, density, ...props }: ChecklistProps) {
  return (
    <ul
      data-slot="checklist"
      data-density={density ?? "default"}
      className={cn(checklistVariants({ density }), className)}
      {...props}
    />
  );
}

interface ChecklistItemProps extends React.ComponentProps<"li"> {
  density?: ChecklistDensity;
}

function ChecklistItem({ className, density, ...props }: ChecklistItemProps) {
  return (
    <li
      data-slot="checklist-item"
      className={cn(checklistItemVariants({ density }), className)}
      {...props}
    />
  );
}

export { Checklist, type ChecklistDensity, ChecklistItem };

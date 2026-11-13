import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "../../libs/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        review: "border-dashed border-foreground/60 text-foreground",
        assessment: "bg-category-assessment-tint text-category-assessment",
        homework: "bg-category-homework-tint text-category-homework",
        schoolTrip: "bg-category-school-trip-tint text-category-school-trip",
        swimming: "bg-category-swimming-tint text-category-swimming",
        documentDue: "bg-category-document-due-tint text-category-document-due",
        urgent: "bg-warning text-warning-foreground",
        soon: "border-border bg-card text-foreground",
      },
      hue: {
        1: "bg-child-1-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        2: "bg-child-2-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        3: "bg-child-3-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        4: "bg-child-4-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        5: "bg-child-5-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        6: "bg-child-6-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        7: "bg-child-7-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
        8: "bg-child-8-container text-foreground has-data-[slot=child-avatar]:pl-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  hue,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, hue }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

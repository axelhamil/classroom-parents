import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const listRowVariants = cva("flex items-center justify-between gap-3", {
  variants: {
    variant: {
      default: "rounded-md border p-3",
      plain: "py-2",
      ruled: "border-b py-1 last:border-b-0",
    },
  },
  defaultVariants: { variant: "default" },
});

interface ListRowProps extends React.ComponentProps<"li">, VariantProps<typeof listRowVariants> {}

function ListRow({ className, variant, ...props }: ListRowProps) {
  return (
    <li data-slot="list-row" className={cn(listRowVariants({ variant }), className)} {...props} />
  );
}

function ListRowMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-media"
      className={cn(
        "flex items-center gap-3 [&>svg:first-child]:size-5 [&>svg:first-child]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function ListRowContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="list-row-content" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

interface ListRowButtonProps extends React.ComponentProps<"button"> {
  asChild?: boolean;
}

/**
 * The row's content as one click target (mark a notification read, open an
 * item). It keeps the content's stacked text layout, which a `Button`, sized
 * for a single-line label, cannot hold without overriding its height and
 * padding. `asChild` makes a router link the target when the row navigates.
 */
function ListRowButton({ className, type, asChild = false, ...props }: ListRowButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="list-row-button"
      type={asChild ? type : (type ?? "button")}
      className={cn(
        "flex flex-col items-start gap-1 rounded-sm px-2 py-2 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring active:bg-accent disabled:cursor-default",
        className,
      )}
      {...props}
    />
  );
}

function ListRowMeta({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-meta"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

function ListRowAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-row-action"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
}

export { ListRow, ListRowAction, ListRowButton, ListRowContent, ListRowMedia, ListRowMeta };

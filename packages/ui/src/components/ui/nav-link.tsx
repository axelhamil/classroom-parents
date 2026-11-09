import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const navLinkVariants = cva(
  "inline-flex shrink-0 items-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      size: {
        sm: "text-xs",
        md: "text-sm",
      },
      variant: {
        plain: "text-muted-foreground hover:text-foreground",
        pill: "rounded-md px-3 py-1.5",
        underline: "relative h-10 px-3 focus-visible:ring-inset",
        tab: "relative flex-1 flex-col justify-center gap-1 rounded-t-lg px-2 py-2 text-xs font-semibold transition-[color,background-color] duration-150 focus-visible:ring-inset md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-t-none md:rounded-r-lg md:px-4 md:py-3 md:text-sm [&_svg]:size-6 md:[&_svg]:size-5",
      },
      active: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "pill",
        active: true,
        className: "bg-accent text-primary",
      },
      {
        variant: "pill",
        active: false,
        className: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      },
      {
        variant: "underline",
        active: true,
        className:
          "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary",
      },
      {
        variant: "underline",
        active: false,
        className: "text-muted-foreground hover:text-foreground",
      },
      {
        variant: "tab",
        active: true,
        className:
          "bg-accent text-primary before:absolute before:inset-x-3 before:top-0 before:h-1 before:rounded-b-full before:bg-primary md:before:inset-x-auto md:before:inset-y-2 md:before:left-0 md:before:h-auto md:before:w-1 md:before:rounded-r-full md:before:rounded-b-none",
      },
      {
        variant: "tab",
        active: false,
        className: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      },
    ],
    defaultVariants: {
      size: "md",
      variant: "plain",
      active: false,
    },
  },
);

function NavLink({
  className,
  size,
  variant,
  active,
  asChild = false,
  ...props
}: React.ComponentProps<"a"> &
  VariantProps<typeof navLinkVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="nav-link"
      data-variant={variant}
      data-active={active ? "" : undefined}
      className={cn(navLinkVariants({ size, variant, active, className }))}
      {...props}
    />
  );
}

export { NavLink, navLinkVariants };

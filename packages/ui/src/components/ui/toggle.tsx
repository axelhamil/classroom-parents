"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../../libs/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-inner text-small font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border border-input bg-transparent shadow-rest hover:bg-accent hover:text-accent-foreground",
        chip: "rounded-full border border-input bg-card hover:bg-accent hover:text-accent-foreground data-[state=on]:border-transparent data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground",
        day: "flex-col gap-1 rounded-full border-2 border-transparent bg-card text-foreground shadow-rest transition-[color,background-color,box-shadow,transform] hover:bg-accent hover:text-accent-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-raised [&>[data-part=day]]:text-title [&>[data-part=day]]:tabular-nums [&>[data-part=dots]]:flex [&>[data-part=dots]]:h-1.5 [&>[data-part=dots]]:gap-0.5 data-[state=on]:[&>[data-part=dots]>*]:ring-1 data-[state=on]:[&>[data-part=dots]>*]:ring-primary-foreground [&>[data-part=weekday]]:text-meta [&>[data-part=weekday]]:capitalize [&>[data-part=day]]:inline-grid [&>[data-part=day]]:h-7 [&>[data-part=day]]:min-w-7 [&>[data-part=day]]:place-items-center [&>[data-part=day]]:rounded-full data-[today=true]:[&>[data-part=day]]:bg-primary data-[today=true]:[&>[data-part=day]]:text-primary-foreground data-[today=true]:data-[state=on]:[&>[data-part=day]]:bg-primary-foreground data-[today=true]:data-[state=on]:[&>[data-part=day]]:text-primary [&>[data-part=count]]:min-w-5 [&>[data-part=count]]:rounded-full [&>[data-part=count]]:px-1 [&>[data-part=count]]:text-meta [&>[data-part=count]]:font-semibold [&>[data-part=count]]:tabular-nums [&>[data-part=count]:empty]:invisible data-[crunch=true]:[&>[data-part=count]]:bg-warning data-[crunch=true]:[&>[data-part=count]]:text-warning-foreground",
      },
      size: {
        default: "h-control min-w-control px-3",
        sm: "h-control-sm min-w-control-sm px-1.5",
        day: "h-auto min-h-control-lg min-w-0 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      data-size={size}
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };

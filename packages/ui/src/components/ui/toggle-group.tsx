"use client";

import type { VariantProps } from "class-variance-authority";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "../../libs/utils";

import { toggleVariants } from "./toggle";

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
});

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    spacing?: number;
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-rest",
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

const toggleGroupItemHues = {
  1: "data-[state=on]:border-child-1-mark data-[state=on]:bg-child-1-container data-[state=on]:text-foreground",
  2: "data-[state=on]:border-child-2-mark data-[state=on]:bg-child-2-container data-[state=on]:text-foreground",
  3: "data-[state=on]:border-child-3-mark data-[state=on]:bg-child-3-container data-[state=on]:text-foreground",
  4: "data-[state=on]:border-child-4-mark data-[state=on]:bg-child-4-container data-[state=on]:text-foreground",
  5: "data-[state=on]:border-child-5-mark data-[state=on]:bg-child-5-container data-[state=on]:text-foreground",
  6: "data-[state=on]:border-child-6-mark data-[state=on]:bg-child-6-container data-[state=on]:text-foreground",
  7: "data-[state=on]:border-child-7-mark data-[state=on]:bg-child-7-container data-[state=on]:text-foreground",
  8: "data-[state=on]:border-child-8-mark data-[state=on]:bg-child-8-container data-[state=on]:text-foreground",
} as const;

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  hue,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants> & { hue?: keyof typeof toggleGroupItemHues }) {
  const context = React.useContext(ToggleGroupContext);

  return (
    <ToggleGroupPrimitive.Item
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10 data-[variant=day]:px-1",
        hue && toggleGroupItemHues[hue],
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
        className,
      )}
      {...props}
      data-slot="toggle-group-item"
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };

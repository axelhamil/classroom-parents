import { cva, type VariantProps } from "class-variance-authority";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "../../libs/utils";

const checkboxVariants = cva(
  "peer size-5 shrink-0 rounded-xs border border-input shadow-rest outline-none focus-visible:border-ring focus-visible:ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      tone: {
        primary:
          "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary",
        1: "data-[state=checked]:border-child-1-mark data-[state=checked]:bg-child-1 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-1",
        2: "data-[state=checked]:border-child-2-mark data-[state=checked]:bg-child-2 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-2",
        3: "data-[state=checked]:border-child-3-mark data-[state=checked]:bg-child-3 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-3",
        4: "data-[state=checked]:border-child-4-mark data-[state=checked]:bg-child-4 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-4",
        5: "data-[state=checked]:border-child-5-mark data-[state=checked]:bg-child-5 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-5",
        6: "data-[state=checked]:border-child-6-mark data-[state=checked]:bg-child-6 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-6",
        7: "data-[state=checked]:border-child-7-mark data-[state=checked]:bg-child-7 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-7",
        8: "data-[state=checked]:border-child-8-mark data-[state=checked]:bg-child-8 data-[state=checked]:text-child-foreground dark:data-[state=checked]:bg-child-8",
      },
    },
    defaultVariants: { tone: "primary" },
  },
);

interface CheckboxProps
  extends React.ComponentProps<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

function Checkbox({ className, tone, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(checkboxVariants({ tone }), className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        forceMount
        data-slot="checkbox-indicator"
        className="grid size-full place-content-center text-current"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="size-3.5"
        >
          <path d="M5 12.5 9.5 17 19 7.5" pathLength={1} />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };

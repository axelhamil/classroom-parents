import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";
import { iconTileVariants } from "./icon-tile";

interface StepperProps extends React.ComponentProps<"div"> {
  asChild?: boolean;
}

function Stepper({ className, asChild = false, ...props }: StepperProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="stepper"
      className={cn(
        "flex flex-1 flex-col gap-6 overflow-x-clip pt-3 pb-[max(--spacing(6),env(safe-area-inset-bottom))] md:pt-8",
        className,
      )}
      {...props}
    />
  );
}

function StepperHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-header"
      className={cn("flex min-h-control items-center gap-3", className)}
      {...props}
    />
  );
}

function StepperPosition({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="stepper-position"
      className={cn("text-small font-medium text-muted-foreground tabular-nums", className)}
      {...props}
    />
  );
}

const stepperPanelVariants = cva("flex flex-1 flex-col gap-6", {
  variants: {
    direction: {
      forward: "animate-step-forward",
      back: "animate-step-back",
    },
  },
  defaultVariants: { direction: "forward" },
});

interface StepperPanelProps
  extends React.ComponentProps<"section">,
    VariantProps<typeof stepperPanelVariants> {}

function StepperPanel({ className, direction, ...props }: StepperPanelProps) {
  return (
    <section
      data-slot="stepper-panel"
      className={cn(stepperPanelVariants({ direction }), className)}
      {...props}
    />
  );
}

function StepperIntro({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-intro"
      className={cn("flex flex-col items-start gap-3 text-pretty", className)}
      {...props}
    />
  );
}

const stepperMediaVariants = cva([iconTileVariants({ size: "lg" }), "animate-pop-in"], {
  variants: {
    tone: {
      default: "",
      success: "bg-success text-success-foreground",
      warning: "bg-warning text-warning-foreground",
      bare: "size-auto bg-transparent",
    },
  },
  defaultVariants: { tone: "default" },
});

interface StepperMediaProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof stepperMediaVariants> {}

function StepperMedia({ className, tone, ...props }: StepperMediaProps) {
  return (
    <div
      data-slot="stepper-media"
      aria-hidden
      className={cn(stepperMediaVariants({ tone }), className)}
      {...props}
    />
  );
}

function StepperActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="stepper-actions"
      className={cn(
        "mt-auto flex md:mt-2 flex-col gap-3 pt-2 sm:flex-row-reverse sm:justify-start [&>*]:w-full sm:[&>*]:w-auto",
        className,
      )}
      {...props}
    />
  );
}

function RevealList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="reveal-list"
      className={cn("flex flex-col gap-3 [&>*]:animate-rise-in", className)}
      {...props}
    />
  );
}

export {
  RevealList,
  Stepper,
  StepperActions,
  StepperHeader,
  StepperIntro,
  StepperMedia,
  StepperPanel,
  StepperPosition,
};

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

const cardVariants = cva(
  "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-rest",
  {
    variants: {
      variant: {
        default: "",
        destructive: "border-destructive/40 bg-destructive/5",
      },
      flush: {
        true: "gap-0 overflow-hidden pt-0",
        false: "",
      },
    },
    defaultVariants: { variant: "default", flush: false },
  },
);

interface CardProps extends React.ComponentProps<"div">, VariantProps<typeof cardVariants> {}

const cardTitleVariants = cva("col-start-1 leading-none font-semibold", {
  variants: {
    variant: {
      default: "",
      destructive: "text-destructive",
    },
  },
  defaultVariants: { variant: "default" },
});

function Card({ className, variant, flush, ...props }: CardProps) {
  return (
    <div data-slot="card" className={cn(cardVariants({ variant, flush }), className)} {...props} />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

interface CardTitleProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardTitleVariants> {
  asChild?: boolean;
}

function CardTitle({ className, variant, asChild = false, ...props }: CardTitleProps) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      data-slot="card-title"
      className={cn(cardTitleVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("col-start-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-span-2 flex flex-wrap gap-2 self-start @md/card-header:col-span-1 @md/card-header:col-start-2 @md/card-header:row-span-2 @md/card-header:row-start-1 @md/card-header:justify-end @md/card-header:justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };

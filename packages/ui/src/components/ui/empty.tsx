import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../libs/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-xl border-dashed p-6 text-center text-balance md:p-12",
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex max-w-sm flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  );
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6",
        scene:
          "relative isolate mb-4 size-20 animate-pop-in text-primary before:absolute before:inset-0 before:-z-20 before:translate-x-2 before:translate-y-1 before:rotate-12 before:rounded-2xl before:bg-secondary before:content-[''] after:absolute after:inset-0 after:-z-10 after:-rotate-3 after:rounded-2xl after:border after:bg-card after:shadow-raised after:content-[''] [&_svg:not([class*='size-'])]:size-9 [&>[data-slot=empty-spark]]:absolute [&>[data-slot=empty-spark]]:-top-1.5 [&>[data-slot=empty-spark]]:-right-2.5 [&>[data-slot=empty-spark]]:size-4 [&>[data-slot=empty-spark]]:rounded-full [&>[data-slot=empty-spark]]:bg-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function EmptyMedia({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    >
      {children}
      {variant === "scene" && <span data-slot="empty-spark" aria-hidden="true" />}
    </div>
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("font-display text-xl font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className,
      )}
      {...props}
    />
  );
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };

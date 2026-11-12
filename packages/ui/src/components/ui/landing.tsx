import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { useCallback } from "react";

import { cn } from "../../libs/utils";

function useRevealOnce() {
  return useCallback((node: HTMLElement | null) => {
    if (!node || typeof IntersectionObserver === "undefined") return;

    node.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        node.dataset.reveal = "shown";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, []);
}

function LandingHero({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="landing-hero"
      className={cn(
        "flex min-h-[calc(100svh-var(--app-bar-height)-var(--landing-peek))] flex-col items-center justify-center gap-6 py-8 text-center short:gap-3 short:py-3",
        className,
      )}
      {...props}
    />
  );
}

function LandingHeadline({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="landing-headline"
      className={cn(
        "max-w-3xl font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl short:text-3xl",
        className,
      )}
      {...props}
    />
  );
}

function LandingLead({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="landing-lead"
      className={cn(
        "max-w-xl text-lg text-muted-foreground text-pretty lg:text-xl short:text-base",
        className,
      )}
      {...props}
    />
  );
}

function LandingAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="landing-action"
      className={cn("flex w-full max-w-md flex-col items-stretch gap-3", className)}
      {...props}
    />
  );
}

function LandingReassurance({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="landing-reassurance"
      className={cn(
        "flex items-center justify-center gap-2 text-left text-sm font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function LandingSheet({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="landing-sheet"
      className={cn(
        "grid gap-12 rounded-4xl border bg-card p-5 shadow-sm sm:p-10 lg:grid-cols-2",
        className,
      )}
      {...props}
    />
  );
}

const landingSectionVariants = cva("flex min-w-0 flex-col gap-5", {
  variants: {
    span: {
      column: "",
      closing: "items-center text-center lg:col-span-2",
    },
  },
  defaultVariants: { span: "column" },
});

function LandingSection({
  className,
  span,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof landingSectionVariants>) {
  return (
    <section
      data-slot="landing-section"
      className={cn(landingSectionVariants({ span }), className)}
      {...props}
    />
  );
}

function LandingSectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="landing-section-title"
      className={cn("font-display text-2xl font-bold tracking-tight", className)}
      {...props}
    />
  );
}

function LandingList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="landing-list"
      className={cn(
        "flex flex-col gap-3 [&_svg]:mt-1 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-destructive [&>li]:flex [&>li]:gap-3",
        className,
      )}
      {...props}
    />
  );
}

function SampleStack({ className, ...props }: React.ComponentProps<"ul">) {
  const reveal = useRevealOnce();

  return (
    <ul
      ref={reveal}
      data-slot="sample-stack"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function SampleFrame({ className, ...props }: React.ComponentProps<"figure">) {
  return (
    <figure
      data-slot="sample-frame"
      className={cn(
        "flex flex-col gap-3 rounded-3xl bg-surface-container p-3 [&>figcaption]:px-1 [&>figcaption]:text-sm [&>figcaption]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  LandingAction,
  LandingHeadline,
  LandingHero,
  LandingLead,
  LandingList,
  LandingReassurance,
  LandingSection,
  LandingSectionTitle,
  LandingSheet,
  SampleFrame,
  SampleStack,
};

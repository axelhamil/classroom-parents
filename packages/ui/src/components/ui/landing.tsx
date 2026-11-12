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

const landingSectionVariants = cva("@container flex flex-col gap-5", {
  variants: {
    surface: {
      plain: "",
      sheet: "rounded-3xl border bg-card p-5 shadow-sm sm:p-8",
    },
  },
  defaultVariants: { surface: "plain" },
});

function LandingSection({
  className,
  surface,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof landingSectionVariants>) {
  const reveal = useRevealOnce();

  return (
    <section
      ref={reveal}
      data-slot="landing-section"
      className={cn(landingSectionVariants({ surface }), className)}
      {...props}
    />
  );
}

function LandingHeadline({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="landing-headline"
      className={cn(
        "max-w-2xl font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl",
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
      className={cn("max-w-xl text-lg text-muted-foreground text-pretty", className)}
      {...props}
    />
  );
}

function LandingSectionTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="landing-section-title"
      className={cn(
        "font-display text-2xl font-bold tracking-tight text-balance sm:text-3xl",
        className,
      )}
      {...props}
    />
  );
}

function SampleStack({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul data-slot="sample-stack" className={cn("flex flex-col gap-3", className)} {...props} />
  );
}

function SampleFrame({ className, ...props }: React.ComponentProps<"figure">) {
  return (
    <figure
      data-slot="sample-frame"
      className={cn(
        "flex flex-col gap-4 rounded-3xl bg-surface-container p-3 sm:p-5 [&>figcaption]:px-1 [&>figcaption]:text-sm [&>figcaption]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function FlowDiagram({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="flow-diagram"
      className={cn(
        "flex flex-col items-stretch gap-2 rounded-2xl bg-surface-container p-4 @xl:flex-row @xl:items-center",
        className,
      )}
      {...props}
    />
  );
}

function FlowNode({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="flow-node"
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-center font-semibold shadow-xs @xl:flex-1 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

const flowEdgeVariants = cva(
  "flex items-center justify-center gap-1.5 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        default: "text-primary",
        blocked: "text-destructive",
      },
    },
    defaultVariants: { tone: "default" },
  },
);

function FlowEdge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof flowEdgeVariants>) {
  return (
    <span data-slot="flow-edge" className={cn(flowEdgeVariants({ tone }), className)} {...props} />
  );
}

function FlowEdges({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="flow-edges"
      className={cn(
        "flex flex-row justify-center gap-4 py-1 @xl:flex-col @xl:gap-1 [&_[data-slot=flow-edge]_svg]:rotate-90 @xl:[&_[data-slot=flow-edge]_svg]:rotate-0",
        className,
      )}
      {...props}
    />
  );
}

export {
  FlowDiagram,
  FlowEdge,
  FlowEdges,
  FlowNode,
  LandingHeadline,
  LandingLead,
  LandingSection,
  LandingSectionTitle,
  SampleFrame,
  SampleStack,
};

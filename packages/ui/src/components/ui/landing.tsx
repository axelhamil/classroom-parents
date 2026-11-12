import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { useCallback } from "react";

import { cn } from "../../libs/utils";

function useReveal() {
  return useCallback((node: HTMLElement | null) => {
    if (!node || typeof IntersectionObserver === "undefined") return;

    node.dataset.reveal = "hidden";
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        node.dataset.inView = String(visible);
        if (visible) node.dataset.reveal = "shown";
      },
      { rootMargin: "0px 0px -10% 0px" },
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
        "grid grid-cols-1 items-center gap-10 pt-6 pb-12 text-center lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:pt-8 lg:pb-14 lg:text-left short:gap-8 short:pt-2",
        className,
      )}
      {...props}
    />
  );
}

function LandingHeroCopy({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="landing-hero-copy"
      className={cn("flex flex-col items-center gap-6 lg:items-start short:gap-3", className)}
      {...props}
    />
  );
}

function LandingHeadline({ className, ...props }: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="landing-headline"
      className={cn(
        "max-w-2xl font-display text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl xl:text-6xl short:text-3xl",
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
      className={cn("max-w-xl text-lg text-pretty sm:text-xl short:text-base", className)}
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

function LandingVisual({ className, ...props }: React.ComponentProps<"figure">) {
  const reveal = useReveal();

  return (
    <figure
      ref={reveal}
      data-slot="landing-visual"
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-end text-left lg:max-w-none [&>figcaption]:mt-4 [&>figcaption]:self-center [&>figcaption]:text-sm [&>figcaption]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function NotificationPreview({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notification-preview"
      className={cn(
        "z-10 -mb-5 flex w-80 max-w-full items-start gap-3 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl lg:translate-x-4",
        className,
      )}
      {...props}
    />
  );
}

function NotificationPreviewContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="notification-preview-content"
      className={cn(
        "flex min-w-0 flex-1 flex-col text-sm leading-snug [&>:first-child]:flex [&>:first-child]:justify-between [&>:first-child]:gap-2 [&>:first-child]:text-xs [&>:first-child]:text-muted-foreground [&>:last-child]:text-muted-foreground [&>:nth-child(2)]:font-semibold",
        className,
      )}
      {...props}
    />
  );
}

function SampleFrame({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sample-frame"
      className={cn(
        "relative flex w-full flex-col gap-3 rounded-3xl border bg-surface-container p-3 pt-6 shadow-lg before:absolute before:-top-3 before:left-8 before:h-6 before:w-24 before:-rotate-3 before:rounded-sm before:bg-warning/80 before:shadow-xs lg:rotate-1",
        className,
      )}
      {...props}
    />
  );
}

function SampleFrameHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sample-frame-header"
      className={cn(
        "flex items-center justify-between gap-3 px-2 font-display text-xl font-bold",
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

function SignInPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sign-in-panel"
      className={cn(
        "relative flex flex-col items-center gap-6 rounded-4xl border bg-card px-5 py-10 text-center shadow-lg before:absolute before:-top-3 before:left-1/2 before:h-6 before:w-24 before:-translate-x-1/2 before:-rotate-3 before:rounded-sm before:bg-warning/80 before:shadow-xs sm:px-8",
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
        "flex flex-col gap-5 text-lg leading-snug [&_svg]:size-11 [&_svg]:shrink-0 [&_svg]:rounded-full [&_svg]:bg-secondary [&_svg]:p-3 [&_svg]:text-secondary-foreground [&>li]:flex [&>li]:items-center [&>li]:gap-4",
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
  LandingHeroCopy,
  LandingLead,
  LandingList,
  LandingReassurance,
  LandingSection,
  LandingSectionTitle,
  LandingSheet,
  LandingVisual,
  NotificationPreview,
  NotificationPreviewContent,
  SampleFrame,
  SampleFrameHeader,
  SampleStack,
  SignInPanel,
};

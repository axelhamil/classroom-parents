import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { childHueFill } from "../../libs/child-hue-classes";
import { cn } from "../../libs/utils";

const childBannerVariants = cva(
  "@container/child-banner relative flex min-h-28 items-start gap-2 px-6 pt-5 pb-9 text-child-foreground",
  {
    variants: {
      hue: childHueFill,
    },
  },
);

interface ChildBannerProps
  extends React.ComponentProps<"div">,
    Required<Pick<VariantProps<typeof childBannerVariants>, "hue">> {}

function ChildBanner({ className, hue, ...props }: ChildBannerProps) {
  return (
    <div
      data-slot="child-banner"
      className={cn(childBannerVariants({ hue }), className)}
      {...props}
    />
  );
}

function ChildBannerText({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="child-banner-text"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  );
}

function ChildBannerTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="child-banner-title"
      className={cn(
        "font-display text-2xl leading-tight font-bold tracking-tight wrap-anywhere @md/child-banner:text-3xl",
        className,
      )}
      {...props}
    />
  );
}

function ChildBannerMeta({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="child-banner-meta"
      className={cn("truncate text-sm text-child-foreground", className)}
      {...props}
    />
  );
}

function ChildBannerAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="child-banner-avatar"
      className={cn(
        "absolute right-6 -bottom-8 rounded-full bg-card p-1 shadow-raised [&>[data-slot=child-avatar]]:ring-0 [&>[data-slot=child-avatar]]:ring-offset-0",
        className,
      )}
      {...props}
    />
  );
}

export { ChildBanner, ChildBannerAvatar, ChildBannerMeta, ChildBannerText, ChildBannerTitle };

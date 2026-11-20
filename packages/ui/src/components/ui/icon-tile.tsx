import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "../../libs/utils";

const iconTileVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-icon-lg",
  {
    variants: {
      size: {
        md: "size-10",
        lg: "size-12",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

interface IconTileProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof iconTileVariants> {}

/**
 * The one round tile an icon sits on when it stands for a whole row, an empty state or a step: 40px beside a line of text,
 * 48px at the head of a screen. The icon inside is always the large icon size.
 */
function IconTile({ className, size, ...props }: IconTileProps) {
  return (
    <span
      data-slot="icon-tile"
      data-size={size}
      className={cn(iconTileVariants({ size }), className)}
      {...props}
    />
  );
}

export { IconTile, iconTileVariants };

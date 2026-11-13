import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const skeletonVariants = cva("bg-accent", {
  variants: {
    shape: {
      card: "rounded-xl",
      line: "h-4 rounded-full",
    },
  },
  defaultVariants: { shape: "card" },
});

interface SkeletonProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof skeletonVariants> {}

function Skeleton({ className, shape, ...props }: SkeletonProps) {
  return (
    <div data-slot="skeleton" className={cn(skeletonVariants({ shape }), className)} {...props} />
  );
}

interface SkeletonGroupProps extends React.ComponentProps<"div"> {
  label: string;
}

function SkeletonGroup({ label, className, ...props }: SkeletonGroupProps) {
  return (
    <div
      data-slot="skeleton-group"
      role="status"
      aria-label={label}
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

interface SkeletonTableProps {
  label: string;
  rows?: number;
  columns?: number;
}

function range(length: number): number[] {
  return Array.from({ length }, (_, position) => position);
}

function SkeletonTable({ label, rows = 5, columns = 4 }: SkeletonTableProps) {
  return (
    <SkeletonGroup label={label}>
      {range(rows + 1).map((row) => (
        <div key={row} className="flex h-10 items-center gap-4">
          {range(columns).map((column) => (
            <Skeleton key={column} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}

export { Skeleton, SkeletonGroup, SkeletonTable };

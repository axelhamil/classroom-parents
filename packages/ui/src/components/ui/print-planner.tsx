import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../libs/utils";

const sheetTitleClass =
  "font-display text-3xl leading-tight font-bold tracking-tight text-balance md:text-4xl print:text-3xl";

const hueBandVariants = cva("border-t-4", {
  variants: {
    hue: {
      1: "border-child-1",
      2: "border-child-2",
      3: "border-child-3",
      4: "border-child-4",
      5: "border-child-5",
      6: "border-child-6",
      7: "border-child-7",
      8: "border-child-8",
    },
  },
});

type HueProps = VariantProps<typeof hueBandVariants>;

function PrintSheet({ className, ...props }: React.ComponentProps<"article">) {
  return (
    <article
      data-slot="print-sheet"
      className={cn(
        "flex flex-col gap-6 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm md:gap-8 md:p-8 print:gap-4 print:rounded-none print:border-0 print:p-0 print:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

function PrintSheetHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="print-sheet-header"
      className={cn("flex flex-col gap-1 border-b-2 border-foreground pb-3", className)}
      {...props}
    />
  );
}

function PrintSheetTitle({ className, ...props }: React.ComponentProps<"h1">) {
  return <h1 data-slot="print-sheet-title" className={cn(sheetTitleClass, className)} {...props} />;
}

function PrintSheetSubtitle({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="print-sheet-subtitle"
      className={cn("text-sm font-normal text-muted-foreground", className)}
      {...props}
    />
  );
}

function PrintSheetFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      data-slot="print-sheet-footer"
      className={cn(
        "flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

const printPlannerVariants = cva("grid grid-cols-1 items-start gap-x-5 gap-y-8", {
  variants: {
    columns: {
      1: "",
      2: "sm:grid-cols-2",
      3: "sm:grid-cols-2 lg:grid-cols-3",
      4: "sm:grid-cols-2 lg:grid-cols-4",
    },
  },
  defaultVariants: { columns: 1 },
});

function PrintPlanner({
  className,
  columns,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof printPlannerVariants>) {
  return (
    <div
      data-slot="print-planner"
      className={cn(printPlannerVariants({ columns }), className)}
      {...props}
    />
  );
}

function PrintPlannerColumn({
  className,
  hue,
  ...props
}: React.ComponentProps<"section"> & HueProps) {
  return (
    <section
      data-slot="print-planner-column"
      className={cn("flex min-w-0 flex-col gap-2 pt-3", hueBandVariants({ hue }), className)}
      {...props}
    />
  );
}

const columnTitleClass =
  "flex min-w-0 items-center gap-2 font-display text-lg leading-tight font-semibold wrap-anywhere";

function PrintPlannerColumnTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="print-planner-column-title"
      className={cn(columnTitleClass, className)}
      {...props}
    />
  );
}

function PrintPlannerList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul data-slot="print-planner-list" className={cn("flex flex-col", className)} {...props} />
  );
}

const printPlannerItemVariants = cva(
  "flex break-inside-avoid items-start gap-2.5 border-b border-dashed py-print-item last:border-b-0",
  {
    variants: {
      past: {
        true: "text-muted-foreground",
        false: "",
      },
    },
    defaultVariants: { past: false },
  },
);

function PrintPlannerItem({
  className,
  past,
  ...props
}: React.ComponentProps<"li"> & VariantProps<typeof printPlannerItemVariants>) {
  return (
    <li
      data-slot="print-planner-item"
      data-past={past ? true : undefined}
      className={cn(printPlannerItemVariants({ past }), className)}
      {...props}
    />
  );
}

const printPlannerBoxVariants = cva("mt-0.5 size-4 shrink-0 rounded-xs border-2", {
  variants: {
    past: {
      true: "border-muted-foreground",
      false: "border-foreground",
    },
  },
  defaultVariants: { past: false },
});

function PrintPlannerBox({
  className,
  past,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof printPlannerBoxVariants>) {
  return (
    <span
      data-slot="print-planner-box"
      aria-hidden
      className={cn(printPlannerBoxVariants({ past }), className)}
      {...props}
    />
  );
}

function PrintPlannerItemTitle({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="print-planner-item-title"
      className={cn("text-sm leading-snug font-medium wrap-anywhere", className)}
      {...props}
    />
  );
}

function PrintPlannerItemMeta({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="print-planner-item-meta"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function PrintPlannerEmpty({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="print-planner-empty"
      className={cn("py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

interface PrintTableProps extends React.ComponentProps<"table"> {
  density?: "regular" | "compact";
}

function PrintTable({ className, density = "regular", ...props }: PrintTableProps) {
  return (
    <table
      data-slot="print-table"
      data-density={density}
      aria-hidden
      className={cn("hidden w-full table-fixed border-collapse print:table", className)}
      {...props}
    />
  );
}

function PrintTableTitle({ className, children, ...props }: React.ComponentProps<"th">) {
  return (
    <th data-slot="print-table-title" className={cn("pb-4 text-left", className)} {...props}>
      <span className="flex flex-col gap-1 border-b-2 border-foreground pb-3">{children}</span>
    </th>
  );
}

function PrintTableTitleText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="print-table-title-text"
      className={cn(sheetTitleClass, className)}
      {...props}
    />
  );
}

function PrintTableChild({
  className,
  hue,
  children,
  ...props
}: React.ComponentProps<"th"> & HueProps) {
  return (
    <th
      data-slot="print-table-child"
      className={cn("px-2.5 pb-1 text-left align-top first:pl-0 last:pr-0", className)}
      {...props}
    >
      <span className={cn(columnTitleClass, "pt-3", hueBandVariants({ hue }))}>{children}</span>
    </th>
  );
}

function PrintTableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="print-table-cell"
      className={cn("px-2.5 align-top first:pl-0 last:pr-0", className)}
      {...props}
    />
  );
}

export {
  PrintPlanner,
  PrintPlannerBox,
  PrintPlannerColumn,
  PrintPlannerColumnTitle,
  PrintPlannerEmpty,
  PrintPlannerItem,
  PrintPlannerItemMeta,
  PrintPlannerItemTitle,
  PrintPlannerList,
  PrintSheet,
  PrintSheetFooter,
  PrintSheetHeader,
  PrintSheetSubtitle,
  PrintSheetTitle,
  PrintTable,
  PrintTableCell,
  PrintTableChild,
  PrintTableTitle,
  PrintTableTitleText,
};

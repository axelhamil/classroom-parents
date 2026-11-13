import type * as React from "react";

import { cn } from "../../libs/utils";

function Checklist({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="checklist" className={cn("flex flex-col", className)} {...props} />;
}

function ChecklistItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="checklist-item"
      className={cn(
        "flex min-h-touch min-w-0 items-center gap-3 rounded-md px-2 hover:bg-accent has-data-[state=checked]:text-muted-foreground [&>label]:min-w-0 [&>label]:flex-1 [&>label]:cursor-pointer [&>label]:py-2 [&>label]:text-base [&>label]:leading-snug [&>label]:font-normal [&>label]:wrap-anywhere has-data-[state=checked]:[&>label]:line-through",
        className,
      )}
      {...props}
    />
  );
}

export { Checklist, ChecklistItem };

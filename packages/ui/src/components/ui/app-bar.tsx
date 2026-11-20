import type * as React from "react";

import { cn } from "../../libs/utils";

function AppBar({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="app-bar"
      className={cn(
        "sticky top-0 z-20 box-content flex h-app-bar shrink-0 items-center gap-3 border-t-3 border-primary bg-background pt-[env(safe-area-inset-top)] pr-[max(var(--page-gutter),env(safe-area-inset-right))] pl-[max(var(--page-gutter),env(safe-area-inset-left))]",
        className,
      )}
      {...props}
    />
  );
}

export { AppBar };

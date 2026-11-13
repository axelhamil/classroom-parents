import type * as React from "react";

import { cn } from "../../libs/utils";

function AppBar({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="app-bar"
      className={cn(
        "sticky top-0 z-20 box-content flex h-app-bar shrink-0 items-center gap-3 bg-background pt-[env(safe-area-inset-top)] pr-[max(--spacing(4),env(safe-area-inset-right))] pl-[max(--spacing(4),env(safe-area-inset-left))] md:pr-[max(--spacing(6),env(safe-area-inset-right))] md:pl-[max(--spacing(6),env(safe-area-inset-left))]",
        className,
      )}
      {...props}
    />
  );
}

export { AppBar };

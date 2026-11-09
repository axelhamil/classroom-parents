import type * as React from "react";

import { cn } from "../../libs/utils";

interface TabBarProps extends React.ComponentProps<"nav"> {
  "aria-label": string;
  brand?: React.ReactNode;
}

function TabBar({ className, brand, children, ...props }: TabBarProps) {
  return (
    <nav
      data-slot="tab-bar"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex flex-col border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-lg md:sticky md:top-0 md:order-first md:h-dvh md:w-60 md:shrink-0 md:gap-6 md:border-t-0 md:border-r md:pt-8 md:pb-0 md:shadow-none",
        className,
      )}
      {...props}
    >
      {brand && (
        <span
          data-slot="tab-bar-brand"
          className="hidden px-5 font-display text-xl leading-tight font-bold text-balance md:block"
        >
          {brand}
        </span>
      )}
      <ul className="flex h-nav items-stretch md:h-auto md:flex-col md:gap-1 md:pr-3 [&>li]:flex [&>li]:flex-1 md:[&>li]:flex-none">
        {children}
      </ul>
    </nav>
  );
}

export { TabBar };

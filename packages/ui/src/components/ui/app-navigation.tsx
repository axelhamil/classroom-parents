import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../../libs/utils";

interface AppNavigationProps extends React.ComponentProps<"nav"> {
  "aria-label": string;
}

function AppNavigation({ className, children, ...props }: AppNavigationProps) {
  return (
    <nav
      data-slot="app-navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-surface-container pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]",
        "md:static md:z-auto md:rounded-full md:border-0 md:p-1",
        className,
      )}
      {...props}
    >
      <ul className="flex h-nav items-stretch md:h-auto md:gap-1 [&>li]:flex [&>li]:flex-1 md:[&>li]:flex-none">
        {children}
      </ul>
    </nav>
  );
}

interface AppNavigationItemProps extends React.ComponentProps<"a"> {
  asChild?: boolean;
}

function AppNavigationItem({ className, asChild = false, ...props }: AppNavigationItemProps) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      data-slot="app-navigation-item"
      className={cn(
        "group/app-navigation-item flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground outline-none focus-visible:ring focus-visible:ring-ring focus-visible:ring-inset aria-[current=page]:font-semibold aria-[current=page]:text-foreground",
        "md:h-touch md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm md:hover:bg-surface-container-high md:aria-[current=page]:bg-card md:aria-[current=page]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function AppNavigationIcon({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="app-navigation-icon"
      aria-hidden
      className={cn(
        "relative isolate flex h-8 w-16 items-center justify-center rounded-full transition-colors duration-200 group-hover/app-navigation-item:bg-surface-container-high [&>svg]:size-6",
        "before:absolute before:inset-0 before:-z-10 before:scale-x-50 before:rounded-full before:bg-secondary before:opacity-0 before:transition-[transform,opacity] before:duration-200 before:ease-emphasized",
        "group-aria-[current=page]/app-navigation-item:text-secondary-foreground group-aria-[current=page]/app-navigation-item:before:scale-x-100 group-aria-[current=page]/app-navigation-item:before:opacity-100",
        "md:size-auto md:before:hidden md:group-hover/app-navigation-item:bg-transparent md:[&>svg]:size-4.5 md:group-aria-[current=page]/app-navigation-item:text-primary",
        className,
      )}
      {...props}
    />
  );
}

export { AppNavigation, AppNavigationIcon, AppNavigationItem };

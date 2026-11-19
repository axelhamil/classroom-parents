import type * as React from "react";

import { cn } from "../../libs/utils";
import { NavLink } from "./nav-link";

/**
 * The table of contents of a long page: one link per `PageSection`, in a row that scrolls
 * sideways on a phone and stays pinned under the app bar on a computer, so any section is one
 * click away wherever the parent is in the page. `aria-label` is required: the page may hold
 * other navigations.
 */
function SectionNav({
  className,
  children,
  ...props
}: React.ComponentProps<"nav"> & { "aria-label": string }) {
  return (
    <nav
      data-slot="section-nav"
      className={cn(
        "scrollbar-none -mx-page-gutter flex h-section-nav items-center overflow-x-auto bg-background px-page-gutter lg:sticky lg:top-app-bar lg:z-10",
        className,
      )}
      {...props}
    >
      <ul className="flex gap-1">{children}</ul>
    </nav>
  );
}

function SectionNavLink({ className, ...props }: React.ComponentProps<"a">) {
  return (
    <li>
      <NavLink variant="pill" className={cn("whitespace-nowrap", className)} {...props} />
    </li>
  );
}

export { SectionNav, SectionNavLink };

import { Band } from "@packages/ui/components/ui/band";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";

export interface FooterLink {
  href: string;
  label: string;
}

export interface SiteFooterProps {
  label: string;
  links: FooterLink[];
}

export function SiteFooter({ label, links }: SiteFooterProps) {
  return (
    <Band asChild>
      <footer>
        <nav
          aria-label={label}
          className={cn(
            pageContainerVariants({ width: "landing" }),
            "flex flex-wrap items-center gap-x-6 gap-y-1 py-3",
          )}
        >
          {links.map((link) => (
            <NavLink key={link.href} size="sm" variant="plain" href={link.href}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </footer>
    </Band>
  );
}

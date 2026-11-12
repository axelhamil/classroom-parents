import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "../../../shared/components/legal-footer";
import { ThemeToggle } from "../../../shared/components/theme-toggle";

interface AuthShellProps {
  hero: ReactNode;
  children: ReactNode;
}

export function AuthShell({ hero, children }: AuthShellProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className={cn(
          pageContainerVariants({ width: "landing" }),
          "flex items-center justify-between py-3",
        )}
      >
        <BrandLink asChild>
          <Link to="/login">
            <BrandMark />
            {t("brand")}
          </Link>
        </BrandLink>
        <ThemeToggle />
      </header>

      <main
        className={cn(
          pageContainerVariants({ width: "landing" }),
          "grid flex-1 gap-10 pt-4 pb-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14 lg:pt-10",
        )}
      >
        <div className="flex flex-col gap-6 lg:sticky lg:top-10 lg:self-start">{hero}</div>
        <div className="flex min-w-0 flex-col gap-14">{children}</div>
      </main>

      <LegalFooter />
    </div>
  );
}

import { AppBar } from "@packages/ui/components/ui/app-bar";
import { BrandLink, BrandMark } from "@packages/ui/components/ui/brand-link";
import { Button } from "@packages/ui/components/ui/button";
import { BackIcon } from "@packages/ui/components/ui/icons";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LegalFooter } from "../../shared/components/legal-footer";
import { Screen } from "../../shared/layout/screen";

export interface LegalScreenProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function LegalScreen({ title, description, children }: LegalScreenProps) {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-dvh flex-col">
      <AppBar className="justify-between">
        <BrandLink asChild>
          <Link to="/">
            <BrandMark />
            {t("brand")}
          </Link>
        </BrandLink>
        <Button asChild variant="ghost">
          <Link to="/">
            <BackIcon />
            <span className="sr-only sm:not-sr-only">{t("legal.backToApp")}</span>
          </Link>
        </Button>
      </AppBar>
      <Screen title={title} description={description} width="reading">
        {children}
      </Screen>
      <LegalFooter />
    </div>
  );
}

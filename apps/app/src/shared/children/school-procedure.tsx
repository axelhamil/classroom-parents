import { Button } from "@packages/ui/components/ui/button";
import { EmailIcon } from "@packages/ui/components/ui/icons";
import { Panel } from "@packages/ui/components/ui/panel";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { SchoolBlockKind } from "./school-error";

export interface SchoolProcedureProps {
  kind: SchoolBlockKind;
}

export function SchoolProcedure({ kind }: SchoolProcedureProps) {
  const { t } = useTranslation("children");

  return (
    <Panel tone="muted" className="flex flex-col items-start gap-4">
      <TypographyP>{t(`school.kinds.${kind}`)}</TypographyP>
      <Button asChild variant="outline">
        <Link to="/aide/ecole">
          <EmailIcon aria-hidden />
          {t("school.guide")}
        </Link>
      </Button>
    </Panel>
  );
}

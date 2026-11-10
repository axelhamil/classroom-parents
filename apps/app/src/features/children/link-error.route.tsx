import { Button } from "@packages/ui/components/ui/button";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { type LinkErrorSearch, linkErrorSearchSchema } from "./children.schema";
import { SchoolProcedure } from "./components/school-procedure";
import { useStartChildLink } from "./hooks/use-start-child-link";
import { classifySchoolError, isSchoolBlock } from "./school-error";

export const Route = createFileRoute("/_protected/_shell/children/link-error")({
  validateSearch: linkErrorSearchSchema,
  component: LinkErrorPage,
});

function toParams({ error, error_description }: LinkErrorSearch): URLSearchParams {
  return new URLSearchParams(
    Object.entries({ error, error_description }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}

function LinkErrorPage() {
  const { t } = useTranslation("children");
  const search = Route.useSearch();
  const kind = classifySchoolError(toParams(search));
  const start = useStartChildLink();

  return (
    <Screen title={t("linkError.title")} description={t("linkError.description")}>
      {isSchoolBlock(kind) ? (
        <SchoolProcedure kind={kind} />
      ) : (
        <TypographyP>{t(`linkError.kinds.${kind}`)}</TypographyP>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={start.isPending}
          onClick={() => start.mutate({ reconnectChildId: search.reconnect ?? null })}
        >
          {t("linkError.retry")}
        </Button>
        <Button asChild variant="outline">
          <Link to="/children">{t("new.toChildren")}</Link>
        </Button>
      </div>
    </Screen>
  );
}

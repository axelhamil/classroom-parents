import { Button } from "@packages/ui/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ADD_CHILD } from "../../shared/children/child-link.mutations";
import { LinkRefusal } from "../../shared/children/link-refusal";
import { useStartChildLink } from "../../shared/children/use-start-child-link";
import { Screen } from "../../shared/layout/screen";
import { linkErrorSearchSchema } from "./children.schema";

export const Route = createFileRoute("/_protected/_shell/children/link-error")({
  validateSearch: linkErrorSearchSchema,
  component: LinkErrorPage,
});

function LinkErrorPage() {
  const { t } = useTranslation("children");
  const search = Route.useSearch();
  const start = useStartChildLink();
  const retry = () =>
    start.mutate(search.reconnect ? { reconnectChildId: search.reconnect } : ADD_CHILD);

  return (
    <Screen title={t("linkError.title")}>
      <LinkRefusal error={search.error} errorDescription={search.error_description} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button disabled={start.isPending} onClick={retry}>
          <RotateCcw aria-hidden />
          {start.isPending ? t("reconnect.pending") : t("linkError.retry")}
        </Button>
        <Button asChild variant="outline">
          <Link to="/children">{t("linkError.toChildren")}</Link>
        </Button>
      </div>
    </Screen>
  );
}

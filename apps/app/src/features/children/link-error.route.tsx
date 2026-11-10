import { Button } from "@packages/ui/components/ui/button";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { ADD_CHILD_ROUND_TRIP, startChildLinkMutationOptions } from "./api/children.mutations";
import { type LinkErrorSearch, linkErrorSearchSchema } from "./children.schema";
import { SchoolProcedure } from "./components/school-procedure";
import { classifySchoolError } from "./school-error";

export const Route = createFileRoute("/_protected/_shell/children/link-error")({
  validateSearch: linkErrorSearchSchema,
  component: LinkErrorPage,
});

function toParams(search: LinkErrorSearch): URLSearchParams {
  return new URLSearchParams(
    Object.entries(search).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function LinkErrorPage() {
  const { t } = useTranslation("children");
  const kind = classifySchoolError(toParams(Route.useSearch()));
  const start = useMutation({
    ...startChildLinkMutationOptions,
    onError: (error) => toastError(error, t("reconnect.failed")),
  });

  return (
    <Screen title={t("linkError.title")} description={t("linkError.description")}>
      <SchoolProcedure kind={kind} />

      <div className="flex flex-wrap gap-2">
        <Button disabled={start.isPending} onClick={() => start.mutate(ADD_CHILD_ROUND_TRIP)}>
          {t("linkError.retry")}
        </Button>
        <Button asChild variant="outline">
          <Link to="/children">{t("new.toChildren")}</Link>
        </Button>
      </div>
    </Screen>
  );
}

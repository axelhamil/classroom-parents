import { Button } from "@packages/ui/components/ui/button";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../../shared/layout/screen";

export function isEventGone(query: UseQueryResult<unknown>): boolean {
  return query.isError && query.data === undefined && apiErrorFields(query.error).status === 404;
}

export function EventNotFound() {
  const { t } = useTranslation("events");

  return (
    <Screen title={t("detail.notFound.title")} description={t("detail.notFound.description")}>
      <Button asChild variant="outline" className="self-start">
        <Link to="/">{t("detail.back")}</Link>
      </Button>
    </Screen>
  );
}

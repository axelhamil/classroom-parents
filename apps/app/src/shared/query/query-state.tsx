import { Alert, AlertTitle } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { OfflineIcon } from "@packages/ui/components/ui/icons";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isConnectionFailure } from "../offline/connection";

export interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  staleMessage?: string;
  children: (data: T) => ReactNode;
}

function NotYetOffline() {
  const { t } = useTranslation("common");

  return (
    <Alert variant="info" role="status">
      <OfflineIcon aria-hidden />
      <AlertTitle>{t("queryState.notYetOffline")}</AlertTitle>
    </Alert>
  );
}

export function QueryState<T>({
  query,
  skeleton,
  empty,
  isEmpty,
  staleMessage,
  children,
}: QueryStateProps<T>) {
  const { t } = useTranslation("common");
  const shownAnyway = query.data !== undefined && isConnectionFailure(query.error);
  const failure = query.isError && !shownAnyway && (
    <LoadErrorAlert
      message={
        query.data === undefined
          ? t("queryState.loadError")
          : (staleMessage ?? t("queryState.loadError"))
      }
      retry={
        <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
          {t("actions.retry")}
        </Button>
      }
    />
  );

  if (query.data === undefined && query.isPaused) return <NotYetOffline />;
  if (query.data === undefined) return failure || skeleton;

  const content = empty !== undefined && isEmpty?.(query.data) ? empty : children(query.data);

  return (
    <>
      {failure}
      {content}
    </>
  );
}

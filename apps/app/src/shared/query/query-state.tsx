import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

export function QueryState<T>({ query, skeleton, empty, isEmpty, children }: QueryStateProps<T>) {
  const { t } = useTranslation("common");

  if (query.isError) {
    return (
      <LoadErrorAlert
        message={t("queryState.loadError")}
        retry={
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            {t("actions.retry")}
          </Button>
        }
      />
    );
  }

  if (query.isPending) return skeleton;

  if (empty !== undefined && isEmpty?.(query.data)) return empty;

  return children(query.data);
}

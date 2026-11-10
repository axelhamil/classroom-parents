import { Button } from "@packages/ui/components/ui/button";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { Panel } from "@packages/ui/components/ui/panel";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { Screen } from "../../shared/layout/screen";
import { reconnectChildMutationOptions, syncChildMutationOptions } from "./api/children.mutations";
import { childrenSearchSchema } from "./children.schema";
import { ChildCard } from "./components/child-card";

export const Route = createFileRoute("/_protected/_shell/children")({
  validateSearch: childrenSearchSchema,
  component: ChildrenPage,
});

function useReconnectOnReturn(childId: string | undefined) {
  const { t } = useTranslation("children");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sync = useMutation(syncChildMutationOptions);
  const reconnect = useMutation({
    ...reconnectChildMutationOptions,
    onSuccess: (child) => {
      toastSuccess(t("list.reconnected", { label: child.label }));
      sync.mutate(child.id);
    },
    onError: (error) => toastError(error, t("reconnect.failed")),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey });
      void navigate({ to: "/children", search: {}, replace: true });
    },
  });
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !childId) return;
    handled.current = true;
    reconnect.mutate(childId);
  }, [childId, reconnect.mutate]);

  return reconnect.isPending;
}

function ChildrenPage() {
  const { t } = useTranslation("children");
  const { t: tErrors } = useTranslation("errors");
  const { reconnect } = Route.useSearch();
  const reconnecting = useReconnectOnReturn(reconnect);
  const children = useQuery(childrenQueryOptions);

  return (
    <Screen
      title={t("list.title")}
      description={t("list.description")}
      aside={
        children.data?.length ? (
          <Button asChild variant="outline">
            <Link to="/children/new">
              <Plus aria-hidden />
              {t("list.add")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {reconnecting && (
        <TypographyMuted aria-live="polite">{t("list.reconnecting")}</TypographyMuted>
      )}

      {children.isPending && <TypographyMuted>{t("list.loading")}</TypographyMuted>}

      {children.isError && (
        <LoadErrorAlert message={formatApiError(children.error, t("list.loading"), tErrors)} />
      )}

      {children.data?.length === 0 && (
        <Panel size="md" className="flex flex-col items-start gap-3">
          <TypographyH2 variant="section">{t("list.emptyTitle")}</TypographyH2>
          <TypographyMuted>{t("list.emptyDescription")}</TypographyMuted>
          <Button asChild>
            <Link to="/children/new">{t("list.add")}</Link>
          </Button>
        </Panel>
      )}

      {children.data && children.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {children.data.map((child) => (
            <li key={child.id}>
              <ChildCard child={child} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

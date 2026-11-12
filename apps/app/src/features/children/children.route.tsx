import { Button } from "@packages/ui/components/ui/button";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Backpack, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import { syncChildMutationOptions } from "../../shared/children/child-link.mutations";
import { BoardEmpty } from "../../shared/events/event-board";
import { childHue } from "../../shared/format/child-hue";
import { Screen } from "../../shared/layout/screen";
import { QueryState } from "../../shared/query/query-state";
import { reconnectChildMutationOptions } from "./api/children.mutations";
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
  const { reconnect } = Route.useSearch();
  const reconnecting = useReconnectOnReturn(reconnect);
  const children = useQuery(childrenQueryOptions);

  return (
    <Screen
      title={t("list.title")}
      description={t("list.description")}
      width="wide"
      actions={
        children.data?.length ? (
          <Button asChild>
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

      <QueryState
        query={children}
        skeleton={
          <SkeletonGroup label={t("list.loading")} className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-56 w-full" />
          </SkeletonGroup>
        }
        empty={
          <BoardEmpty
            icon={Backpack}
            title={t("list.emptyTitle")}
            description={t("list.emptyDescription")}
            action={
              <Button asChild size="sm">
                <Link to="/onboarding">{t("list.emptyAction")}</Link>
              </Button>
            }
          />
        }
        isEmpty={(family) => family.length === 0}
      >
        {(family) => (
          <ul className="grid items-start gap-x-4 gap-y-6 md:grid-cols-2">
            {family.map((child) => (
              <li key={child.id}>
                <ChildCard child={child} hue={childHue(family, child.id)} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </Screen>
  );
}

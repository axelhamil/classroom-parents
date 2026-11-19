import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { SwitchField } from "@packages/ui/components/ui/switch-field";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { QueryState } from "../../../shared/query/query-state";
import { setDigestMutationOptions } from "../api/settings.mutations";
import { digestQueryOptions } from "../api/settings.queries";

export interface DigestCardProps {
  userId: string;
}

export function DigestCard({ userId }: DigestCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = useQuery(digestQueryOptions(userId));
  const save = useMutation({
    ...setDigestMutationOptions,
    onSuccess: (enabled) => queryClient.setQueryData(digestQueryOptions(userId).queryKey, enabled),
    onError: (error) => toastError(error, errorFallback("setDigest")),
  });

  return (
    <SectionCard title={t("digest.title")} description={t("digest.description")}>
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("digest.loading")}>
            <Skeleton className="h-10 w-full" />
          </SkeletonGroup>
        }
      >
        {(stored) => {
          const enabled = save.isPending ? save.variables : stored;

          return (
            <SwitchField
              label={t("digest.enabled")}
              description={enabled ? t("digest.on") : t("digest.off")}
              checked={enabled}
              disabled={save.isPending}
              onCheckedChange={(checked) => save.mutate(checked)}
            />
          );
        }}
      </QueryState>
    </SectionCard>
  );
}

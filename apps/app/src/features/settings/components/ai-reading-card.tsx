import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { SwitchField } from "@packages/ui/components/ui/switch-field";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { QueryState } from "../../../shared/query/query-state";
import { setExtractionMutationOptions } from "../api/settings.mutations";
import { assistantPreferencesQueryOptions } from "../api/settings.queries";

export interface AiReadingCardProps {
  userId: string;
}

export function AiReadingCard({ userId }: AiReadingCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = useQuery(assistantPreferencesQueryOptions(userId));
  const save = useMutation({
    ...setExtractionMutationOptions,
    onSuccess: (saved) =>
      queryClient.setQueryData(assistantPreferencesQueryOptions(userId).queryKey, saved),
    onError: (error) => toastError(error, errorFallback("setExtraction")),
  });

  return (
    <SectionCard title={t("aiReading.title")} description={t("aiReading.description")}>
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("aiReading.loading")}>
            <Skeleton className="h-10 w-full" />
          </SkeletonGroup>
        }
      >
        {({ extractionEnabled }) => {
          const enabled = save.isPending ? save.variables : extractionEnabled;

          return (
            <SwitchField
              label={t("aiReading.enabled")}
              description={enabled ? t("aiReading.on") : t("aiReading.off")}
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

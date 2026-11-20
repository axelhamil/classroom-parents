import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { SwitchField } from "@packages/ui/components/ui/switch-field";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { assistantPreferencesQueryOptions } from "../../../shared/api/queries/assistant-preferences";
import { QueryState } from "../../../shared/query/query-state";
import { setExtractionMutationOptions } from "../api/settings.mutations";

export interface AiReadingCardProps {
  userId: string;
}

export function AiReadingCard({ userId }: AiReadingCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const preferences = assistantPreferencesQueryOptions(userId);
  const { queryKey } = preferences;
  const query = useQuery(preferences);
  const [resumed, setResumed] = useState(false);
  const save = useMutation({
    ...setExtractionMutationOptions,
    onSuccess: (saved) => {
      const wasPaused = queryClient.getQueryData(queryKey)?.extractionEnabled === false;

      setResumed(wasPaused && saved.extractionEnabled);
      queryClient.setQueryData(queryKey, saved);
    },
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
            <div className="flex flex-col gap-3">
              <SwitchField
                label={t("aiReading.enabled")}
                description={enabled ? t("aiReading.on") : t("aiReading.off")}
                checked={enabled}
                disabled={save.isPending}
                onCheckedChange={(checked) => save.mutate(checked)}
              />
              <TypographyMuted role="status" className="empty:hidden">
                {resumed && enabled ? t("aiReading.resumed") : null}
              </TypographyMuted>
            </div>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}

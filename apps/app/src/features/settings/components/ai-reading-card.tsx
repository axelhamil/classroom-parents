import {
  SettingsGroup,
  SettingsMore,
  SettingsRow,
  settingsRowDescriptionId,
} from "@packages/ui/components/ui/settings";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { Switch } from "@packages/ui/components/ui/switch";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { assistantPreferencesQueryOptions } from "../../../shared/api/queries/assistant-preferences";
import { QueryState } from "../../../shared/query/query-state";
import { setExtractionMutationOptions } from "../api/settings.mutations";
import { useAutoSave } from "../hooks/use-auto-save";
import { SETTINGS_ANCHORS } from "../settings-search-index";

export interface AiReadingCardProps {
  userId: string;
}

export function AiReadingCard({ userId }: AiReadingCardProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const query = assistantPreferencesQueryOptions(userId);
  const preferences = useQuery(query);
  const [resumed, setResumed] = useState(false);
  const { save } = useAutoSave({
    mutation: setExtractionMutationOptions,
    queryKey: query.queryKey,
    apply: (stored, extractionEnabled) => ({ ...stored, extractionEnabled }),
    merge: (_stored, saved) => saved,
    restoreValue: ({ extractionEnabled }) => extractionEnabled,
    failure: "setExtraction",
    onSaved: (saved, previous) =>
      setResumed(previous?.extractionEnabled === false && saved.extractionEnabled),
  });

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.aiReading} title={t("aiReading.title")}>
      <QueryState
        query={preferences}
        skeleton={
          <SkeletonGroup label={t("aiReading.loading")}>
            <Skeleton className="h-10 w-full" />
          </SkeletonGroup>
        }
      >
        {({ extractionEnabled }) => (
          <SettingsRow
            label={t("aiReading.enabled")}
            description={extractionEnabled ? t("aiReading.on") : t("aiReading.off")}
            controlId={id}
            control={
              <Switch
                id={id}
                checked={extractionEnabled}
                onCheckedChange={save}
                aria-describedby={settingsRowDescriptionId(id)}
              />
            }
          >
            <TypographyMuted role="status" className="empty:hidden">
              {resumed && extractionEnabled ? t("aiReading.resumed") : null}
            </TypographyMuted>
            <SettingsMore label={t("more")}>
              <p>{t("aiReading.description")}</p>
            </SettingsMore>
          </SettingsRow>
        )}
      </QueryState>
    </SettingsGroup>
  );
}

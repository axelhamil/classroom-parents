import {
  SettingsGroup,
  SettingsMore,
  SettingsRow,
  settingsRowDescriptionId,
} from "@packages/ui/components/ui/settings";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { Switch } from "@packages/ui/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { QueryState } from "../../../shared/query/query-state";
import { setDigestMutationOptions } from "../api/settings.mutations";
import { digestQueryOptions } from "../api/settings.queries";
import { useAutoSave } from "../hooks/use-auto-save";
import { SETTINGS_ANCHORS } from "../settings-search-index";

export interface DigestCardProps {
  userId: string;
}

export function DigestCard({ userId }: DigestCardProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const query = digestQueryOptions(userId);
  const digest = useQuery(query);
  const { save } = useAutoSave({
    mutation: setDigestMutationOptions,
    queryKey: query.queryKey,
    apply: (_enabled, next) => next,
    merge: (_stored, saved) => saved,
    restoreValue: (enabled) => enabled,
    failure: "setDigest",
  });

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.digest} title={t("digest.title")}>
      <QueryState
        query={digest}
        skeleton={
          <SkeletonGroup label={t("digest.loading")}>
            <Skeleton className="h-10 w-full" />
          </SkeletonGroup>
        }
      >
        {(enabled) => (
          <SettingsRow
            label={t("digest.enabled")}
            description={enabled ? t("digest.on") : t("digest.off")}
            controlId={id}
            control={
              <Switch
                id={id}
                checked={enabled}
                onCheckedChange={save}
                aria-describedby={settingsRowDescriptionId(id)}
              />
            }
          >
            <SettingsMore label={t("more")}>
              <p>{t("digest.description")}</p>
            </SettingsMore>
          </SettingsRow>
        )}
      </QueryState>
    </SettingsGroup>
  );
}

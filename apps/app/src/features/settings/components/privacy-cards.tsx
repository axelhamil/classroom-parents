import { Button } from "@packages/ui/components/ui/button";
import {
  AnnouncementsIcon,
  CoursesIcon,
  CourseworkIcon,
  DocumentIcon,
  ExportDataIcon,
  OpenRowIcon,
  RightsIcon,
} from "@packages/ui/components/ui/icons";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { SettingsGroup, SettingsMore, SettingsRow } from "@packages/ui/components/ui/settings";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type DataExport, exportDataMutationOptions } from "../../rgpd/api/rgpd.mutations";
import { SETTINGS_ANCHORS } from "../settings-search-index";

const READS = [
  { key: "privacy.reads.courses", icon: CoursesIcon },
  { key: "privacy.reads.announcements", icon: AnnouncementsIcon },
  { key: "privacy.reads.coursework", icon: CourseworkIcon },
] as const;

export function DataReadCard() {
  const { t } = useTranslation("settings");

  return (
    <SettingsGroup
      id={SETTINGS_ANCHORS.data}
      title={t("privacy.reads.title")}
      description={t("privacy.reads.description")}
    >
      <ItemGroup className="gap-2">
        {READS.map(({ key, icon: Icon }) => (
          <Item key={key} role="listitem" variant="muted" size="sm">
            <ItemMedia variant="icon">
              <Icon aria-hidden />
            </ItemMedia>
            <ItemContent>
              <TypographyP>{t(key)}</TypographyP>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
      <SettingsMore label={t("more")}>
        <p>{t("privacy.limitedUse.body")}</p>
        <p>{t("privacy.ai.body")}</p>
        <p>{t("privacy.retention.body")}</p>
      </SettingsMore>
    </SettingsGroup>
  );
}

function download({ fileName, content }: DataExport): void {
  const url = URL.createObjectURL(content);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function YourDataCard() {
  const { t } = useTranslation("settings");
  const exporter = useMutation({
    ...exportDataMutationOptions,
    onSuccess: (data) => {
      download(data);
      toastSuccess(t("export.done"));
    },
    onError: (error) => toastError(error, errorFallback("exportData")),
  });

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.export} title={t("export.groupTitle")}>
      <SettingsRow
        label={t("export.title")}
        description={t("export.description")}
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporter.isPending}
            onClick={() => exporter.mutate()}
          >
            <ExportDataIcon aria-hidden />
            {exporter.isPending ? t("export.pending") : t("export.action")}
          </Button>
        }
      />
      <LinkRow
        to="/legal/privacy-policy"
        label={t("links.policy")}
        icon={<DocumentIcon aria-hidden />}
      />
      <LinkRow
        to="/legal/data-rights"
        label={t("links.dataRights")}
        icon={<RightsIcon aria-hidden />}
      />
    </SettingsGroup>
  );
}

interface LinkRowProps {
  to: "/legal/privacy-policy" | "/legal/data-rights";
  label: string;
  icon: ReactNode;
}

function LinkRow({ to, label, icon }: LinkRowProps) {
  return (
    <Item asChild size="sm">
      <Link to={to}>
        <ItemMedia>{icon}</ItemMedia>
        <ItemContent>
          <ItemTitle>{label}</ItemTitle>
        </ItemContent>
        <ItemActions>
          <OpenRowIcon
            aria-hidden
            className="transition-transform group-hover/item:translate-x-0.5"
          />
        </ItemActions>
      </Link>
    </Item>
  );
}

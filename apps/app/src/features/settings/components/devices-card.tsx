import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@packages/ui/components/ui/item";
import { LoadErrorAlert } from "@packages/ui/components/ui/load-error-alert";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Laptop, LogOut, type LucideIcon, Smartphone } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  revokeOtherSessionsMutationOptions,
  revokeSessionMutationOptions,
} from "../api/settings.mutations";
import { sessionsQueryOptions } from "../api/settings.queries";
import {
  BROWSER_KEYS,
  DEVICE_KIND_KEYS,
  type DeviceKind,
  summarizeUserAgent,
} from "../device-labels";

const SHOWN_DEVICES = 20;

const DEVICE_ICONS: Record<DeviceKind, LucideIcon> = {
  ios: Smartphone,
  android: Smartphone,
  mac: Laptop,
  windows: Laptop,
  linux: Laptop,
  unknown: Globe,
};

export interface DevicesCardProps {
  userId: string;
  currentSessionToken: string;
}

interface DeviceSession {
  id: string;
  token: string;
  userAgent?: string | null;
  updatedAt: Date | string;
}

function byLatestActivity(first: DeviceSession, second: DeviceSession): number {
  return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
}

export function DevicesCard({ userId, currentSessionToken }: DevicesCardProps) {
  const { t } = useTranslation(["settings", "common"]);
  const queryClient = useQueryClient();
  const query = useQuery(sessionsQueryOptions(userId));
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: sessionsQueryOptions(userId).queryKey });
  const revokeOthers = useMutation({
    ...revokeOtherSessionsMutationOptions,
    onSuccess: () => {
      toastSuccess(t("devices.revokedOthers"));
      void refresh();
    },
    onError: (error) => toastError(error, t("devices.revokeOthersFailed")),
  });

  const sessions = [...(query.data ?? [])].sort(byLatestActivity);
  const thisDevice = sessions.filter((session) => session.token === currentSessionToken);
  const others = sessions.filter((session) => session.token !== currentSessionToken);
  const shown = [...thisDevice, ...others].slice(0, SHOWN_DEVICES);
  const hidden = sessions.length - shown.length;

  return (
    <SectionCard
      title={t("devices.title")}
      description={t("devices.description")}
      footer={
        others.length > 0 ? (
          <DestructiveActionDialog
            trigger={
              <Button type="button" variant="outline" disabled={revokeOthers.isPending}>
                <LogOut />
                {t("devices.revokeOthers")}
              </Button>
            }
            title={t("devices.revokeOthersTitle")}
            description={t("devices.revokeOthersDescription")}
            actionLabel={t("devices.revokeOthersConfirm")}
            cancelLabel={t("common:actions.cancel")}
            isPending={revokeOthers.isPending}
            onConfirm={() => revokeOthers.mutate()}
          />
        ) : null
      }
    >
      {query.isPending ? (
        <SkeletonGroup label={t("devices.loading")} className="gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </SkeletonGroup>
      ) : query.isError ? (
        <LoadErrorAlert
          message={t("devices.loadError")}
          retry={
            <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
              {t("common:actions.retry")}
            </Button>
          }
        />
      ) : (
        <ItemGroup className="gap-2">
          {shown.map((session) => (
            <DeviceRow
              key={session.id}
              session={session}
              isCurrent={session.token === currentSessionToken}
              onRevoked={refresh}
            />
          ))}
        </ItemGroup>
      )}
      {query.isSuccess && others.length === 0 ? (
        <TypographyMuted>{t("devices.alone")}</TypographyMuted>
      ) : null}
      {hidden > 0 ? (
        <TypographyMuted>{t("devices.hidden", { count: hidden })}</TypographyMuted>
      ) : null}
    </SectionCard>
  );
}

interface DeviceRowProps {
  session: DeviceSession;
  isCurrent: boolean;
  onRevoked: () => Promise<void>;
}

function DeviceRow({ session, isCurrent, onRevoked }: DeviceRowProps) {
  const { t } = useTranslation("settings");
  const formatDateTime = useFormatDateTime();
  const labelId = useId();
  const revoke = useMutation({
    ...revokeSessionMutationOptions,
    onSuccess: () => {
      toastSuccess(t("devices.revoked"));
      void onRevoked();
    },
    onError: (error) => toastError(error, t("devices.revokeFailed")),
  });

  const summary = session.userAgent ? summarizeUserAgent(session.userAgent) : undefined;
  const Icon = DEVICE_ICONS[summary?.kind ?? "unknown"];
  const label = summary
    ? t("devices.label", {
        browser: t(BROWSER_KEYS[summary.browser]),
        device: t(DEVICE_KIND_KEYS[summary.kind]),
      })
    : t("devices.unknown");

  return (
    <Item role="listitem" variant="outline" size="sm">
      <ItemMedia variant="icon">
        <Icon aria-hidden />
      </ItemMedia>
      <ItemContent>
        <ItemTitle id={labelId}>
          {label}
          {isCurrent ? <Badge variant="secondary">{t("devices.current")}</Badge> : null}
        </ItemTitle>
        <ItemDescription>
          {isCurrent
            ? t("devices.currentActivity")
            : t("devices.lastActive", { date: formatDateTime(new Date(session.updatedAt)) })}
        </ItemDescription>
      </ItemContent>
      {isCurrent ? null : (
        <ItemActions>
          <Button
            type="button"
            variant="ghost"
            aria-describedby={labelId}
            disabled={revoke.isPending}
            onClick={() => revoke.mutate(session.token)}
          >
            {t("devices.revoke")}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

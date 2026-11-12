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
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Globe, Laptop, LogOut, type LucideIcon, Smartphone } from "lucide-react";
import { type ComponentProps, useId, useLayoutEffect, useRef, useState } from "react";
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

const VIRTUALIZE_ABOVE = 20;
const ESTIMATED_ROW_HEIGHT = 72;
const ROW_GAP = 8;
const OVERSCAN_ROWS = 4;

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
  const ordered = [...thisDevice, ...others];

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
        <DeviceList
          sessions={ordered}
          currentSessionToken={currentSessionToken}
          locked={revokeOthers.isPending}
          onRevoked={refresh}
        />
      )}
      {query.isSuccess && others.length === 0 ? (
        <TypographyMuted>{t("devices.alone")}</TypographyMuted>
      ) : null}
    </SectionCard>
  );
}

interface DeviceListProps {
  sessions: readonly DeviceSession[];
  currentSessionToken: string;
  locked: boolean;
  onRevoked: () => Promise<void>;
}

function DeviceList(props: DeviceListProps) {
  if (props.sessions.length > VIRTUALIZE_ABOVE) return <VirtualDeviceList {...props} />;

  return (
    <ItemGroup className="gap-2">
      {props.sessions.map((session) => (
        <DeviceRow
          key={session.id}
          className="animate-enter"
          session={session}
          isCurrent={session.token === props.currentSessionToken}
          locked={props.locked}
          onRevoked={props.onRevoked}
        />
      ))}
    </ItemGroup>
  );
}

function VirtualDeviceList({ sessions, currentSessionToken, locked, onRevoked }: DeviceListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useDocumentTop(listRef);
  const virtualizer = useWindowVirtualizer({
    count: sessions.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    gap: ROW_GAP,
    overscan: OVERSCAN_ROWS,
    scrollMargin,
    getItemKey: (index) => sessions[index]?.id ?? index,
  });

  return (
    <ItemGroup
      ref={listRef}
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((row) => {
        const session = sessions[row.index];
        if (!session) return null;

        return (
          <DeviceRow
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
            session={session}
            isCurrent={session.token === currentSessionToken}
            locked={locked}
            onRevoked={onRevoked}
          />
        );
      })}
    </ItemGroup>
  );
}

function useDocumentTop(ref: { current: HTMLElement | null }): number {
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => setTop(element.getBoundingClientRect().top + window.scrollY);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [ref]);

  return top;
}

interface DeviceRowProps extends ComponentProps<typeof Item> {
  session: DeviceSession;
  isCurrent: boolean;
  locked: boolean;
  onRevoked: () => Promise<void>;
}

function DeviceRow({ session, isCurrent, locked, onRevoked, ...props }: DeviceRowProps) {
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
    <Item role="listitem" variant="outline" size="sm" {...props}>
      <ItemMedia variant="icon">
        <Icon aria-hidden />
      </ItemMedia>
      <ItemContent className="basis-40">
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
        <ItemActions className="ml-auto">
          <Button
            type="button"
            variant="ghost"
            aria-describedby={labelId}
            disabled={locked || revoke.isPending}
            onClick={() => revoke.mutate(session.token)}
          >
            {t("devices.revoke")}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}

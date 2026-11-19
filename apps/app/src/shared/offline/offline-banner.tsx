import { wallTimeLabel } from "@packages/i18n";
import { Alert, AlertTitle } from "@packages/ui/components/ui/alert";
import { OfflineIcon, WeakConnectionIcon } from "@packages/ui/components/ui/icons";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EVENTS_KEY } from "../api/queries/events";
import { useConnection } from "./connection";

const LOCALE = "fr-FR";

function agendaFetchedAt(queryClient: QueryClient): number | undefined {
  const times = queryClient
    .getQueryCache()
    .findAll({ queryKey: EVENTS_KEY })
    .map((query) => query.state.dataUpdatedAt)
    .filter((at) => at > 0);

  return times.length ? Math.max(...times) : undefined;
}

export interface SnapshotLabel {
  day: string;
  time: string;
}

export function snapshotLabel(at: Date): SnapshotLabel {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, options).format(at);

  return {
    day: part({ day: "2-digit", month: "2-digit" }),
    time: wallTimeLabel(part({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" })),
  };
}

export function OfflineBanner() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const connection = useConnection();
  const fetchedAt = useMemo(
    () => (connection === "online" ? undefined : agendaFetchedAt(queryClient)),
    [connection, queryClient],
  );

  if (connection === "online") return null;

  const Icon = connection === "offline" ? OfflineIcon : WeakConnectionIcon;

  return (
    <div className={cn(pageContainerVariants(), "pt-4 print:hidden")}>
      <Alert variant="info" role="status">
        <Icon aria-hidden />
        <AlertTitle>
          {fetchedAt === undefined
            ? t(`connection.${connection}.withoutData`)
            : t(`connection.${connection}.withData`, { ...snapshotLabel(new Date(fetchedAt)) })}
        </AlertTitle>
      </Alert>
    </div>
  );
}

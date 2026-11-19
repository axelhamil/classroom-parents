import { wallTimeLabel } from "@packages/i18n";
import { Alert, AlertTitle } from "@packages/ui/components/ui/alert";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { onlineManager, type QueryClient, useQueryClient } from "@tanstack/react-query";
import { WifiOffIcon } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { EVENTS_KEY } from "../api/queries/events";

const LOCALE = "fr-FR";

function subscribeOnline(onChange: () => void): () => void {
  return onlineManager.subscribe(() => onChange());
}

function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => onlineManager.isOnline(),
    () => true,
  );
}

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
  const online = useOnline();
  const fetchedAt = useMemo(
    () => (online ? undefined : agendaFetchedAt(queryClient)),
    [online, queryClient],
  );

  if (online) return null;

  return (
    <div className={cn(pageContainerVariants(), "pt-4 print:hidden")}>
      <Alert variant="info" role="status">
        <WifiOffIcon aria-hidden />
        <AlertTitle>
          {fetchedAt === undefined
            ? t("offline.withoutData")
            : t("offline.withData", { ...snapshotLabel(new Date(fetchedAt)) })}
        </AlertTitle>
      </Alert>
    </div>
  );
}

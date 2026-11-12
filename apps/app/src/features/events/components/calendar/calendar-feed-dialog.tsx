import { Button } from "@packages/ui/components/ui/button";
import { CopyableValue } from "@packages/ui/components/ui/copyable-value";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/ui/dialog";
import { Skeleton } from "@packages/ui/components/ui/skeleton";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlusIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntlLocale } from "../../../../shared/i18n/use-intl-locale";
import { QueryState } from "../../../../shared/query/query-state";
import {
  issueCalendarFeedMutationOptions,
  revokeCalendarFeedMutationOptions,
} from "../../api/events.mutations";
import {
  CALENDAR_FEED_KEY,
  type CalendarFeedStatus,
  calendarFeedQueryOptions,
} from "../../api/events.queries";

function webcalOf(url: string): string {
  return url.replace(/^https?:/, "webcal:");
}

export interface CalendarFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarFeedDialog({ open, onOpenChange }: CalendarFeedDialogProps) {
  const { t } = useTranslation("events");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("calendar.close")}>
        <DialogHeader>
          <DialogTitle>{t("calendar.feed.title")}</DialogTitle>
          <DialogDescription>{t("calendar.feed.description")}</DialogDescription>
        </DialogHeader>
        {open && <CalendarFeedBody />}
      </DialogContent>
    </Dialog>
  );
}

function CalendarFeedBody() {
  const { t } = useTranslation("events");
  const feed = useQuery(calendarFeedQueryOptions);
  const queryClient = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const settle = () => queryClient.invalidateQueries({ queryKey: CALENDAR_FEED_KEY });
  const issue = useMutation({
    ...issueCalendarFeedMutationOptions,
    onSuccess: (issued) => {
      setUrl(issued.url);
      void settle();
    },
    onError: (error) => toastError(error, errorFallback("issueCalendarFeed")),
  });
  const revoke = useMutation({
    ...revokeCalendarFeedMutationOptions,
    onSuccess: () => {
      setUrl(null);
      toastSuccess(t("calendar.feed.revoked"));
      void settle();
    },
    onError: (error) => toastError(error, errorFallback("revokeCalendarFeed")),
  });
  const busy = issue.isPending || revoke.isPending;

  if (url)
    return (
      <div className="flex flex-col gap-4">
        <TypographyMuted>{t("calendar.feed.shownOnce")}</TypographyMuted>
        <CopyableValue
          value={url}
          copyLabel={t("calendar.feed.copy")}
          onCopied={() => toastSuccess(t("calendar.feed.copied"))}
        />
        <Button asChild className="self-start">
          <a href={webcalOf(url)}>
            <CalendarPlusIcon aria-hidden />
            {t("calendar.feed.open")}
          </a>
        </Button>
      </div>
    );

  return (
    <QueryState
      query={feed}
      skeleton={<Skeleton aria-label={t("calendar.feed.loading")} className="h-24 w-full" />}
    >
      {(status) => (
        <FeedStatus
          status={status}
          busy={busy}
          onIssue={() => issue.mutate()}
          onRevoke={() => revoke.mutate()}
        />
      )}
    </QueryState>
  );
}

interface FeedStatusProps {
  status: CalendarFeedStatus;
  busy: boolean;
  onIssue: () => void;
  onRevoke: () => void;
}

function FeedStatus({ status, busy, onIssue, onRevoke }: FeedStatusProps) {
  const { t } = useTranslation("events");
  const locale = useIntlLocale();
  const dateOf = (instant: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(instant));

  if (!status.exists)
    return (
      <Button onClick={onIssue} disabled={busy} className="self-start">
        <CalendarPlusIcon aria-hidden />
        {t("calendar.feed.create")}
      </Button>
    );

  return (
    <div className="flex flex-col gap-4">
      <TypographyP>
        {t("calendar.feed.active", { date: dateOf(status.rotatedAt ?? status.createdAt) })}{" "}
        {status.lastFetchedAt
          ? t("calendar.feed.lastFetched", { date: dateOf(status.lastFetchedAt) })
          : t("calendar.feed.neverFetched")}
      </TypographyP>
      <div className="flex flex-col items-start gap-1">
        <Button variant="outline" onClick={onIssue} disabled={busy}>
          {t("calendar.feed.renew")}
        </Button>
        <TypographyMuted>{t("calendar.feed.renewHint")}</TypographyMuted>
      </div>
      <Button variant="destructive" onClick={onRevoke} disabled={busy} className="self-start">
        {t("calendar.feed.revoke")}
      </Button>
    </div>
  );
}

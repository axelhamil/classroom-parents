import { mondayOf } from "@packages/ddd-kit/days";
import { CelebrationStamp } from "@packages/ui/components/ui/celebration-stamp";
import {
  readStoredValue,
  userStorageKey,
  writeStoredValue,
} from "@packages/web-kit/storage/use-stored-value";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { CheckCheckIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import type { EventItem } from "../../../shared/api/queries/events";
import { dayLabel } from "../../../shared/format/deadline-label";
import { schoolToday } from "../../../shared/format/school-today";
import { useIntlLocale } from "../../../shared/i18n/use-intl-locale";
import { markEventDoneMutationOptions } from "../api/events.mutations";
import { calendarEventsQueryOptions } from "../api/events.queries";
import { weekAhead } from "../week";

const celebratedSchema = z.object({ days: z.array(z.string()), weeks: z.array(z.string()) });

type Celebrated = z.infer<typeof celebratedSchema>;

const NONE: Celebrated = { days: [], weeks: [] };

function completedDays(events: readonly EventItem[]): string[] {
  const dates = [...new Set(events.map((event) => event.deadlineDate))];

  return dates.filter((date) => events.every((event) => event.deadlineDate !== date || event.done));
}

interface Progress {
  scope: string;
  completed: string;
}

export function useCelebrateProgress(now: Date): void {
  const { t } = useTranslation("events");
  const { user } = ProtectedRoute.useRouteContext();
  const locale = useIntlLocale();
  const query = useQuery(calendarEventsQueryOptions(weekAhead(schoolToday(now))));
  const toggling = useIsMutating({ mutationKey: markEventDoneMutationOptions.mutationKey }) > 0;
  const loaded = query.data ?? [];
  const week = mondayOf(schoolToday(now));
  const progress: Progress | null =
    query.isSuccess && !toggling
      ? {
          scope: [week, ...loaded.map((event) => event.id)].join("\n"),
          completed: [
            ...completedDays(loaded),
            ...(loaded.length > 0 && loaded.every((event) => event.done) ? [`week:${week}`] : []),
          ].join("\n"),
        }
      : null;
  const previous = useRef<Progress | null>(null);
  const key = userStorageKey(user.id, "celebrations");

  // biome-ignore lint/correctness/useExhaustiveDependencies: a celebration answers a deadline the parent marked done and the server confirmed, so only a settled change of what is complete within the same events counts
  useEffect(() => {
    if (!progress) return;

    const before = previous.current;
    previous.current = progress;
    if (!before || before.scope !== progress.scope) return;

    const known = new Set(before.completed.split("\n"));
    const fresh = progress.completed
      .split("\n")
      .filter((entry) => entry !== "" && !known.has(entry));
    if (fresh.length === 0) return;

    const today = schoolToday(now);
    const stored = readStoredValue(key, celebratedSchema, NONE);
    const days = fresh.filter(
      (entry) => !entry.startsWith("week:") && !stored.days.includes(entry),
    );
    const weekDone = fresh.includes(`week:${week}`) && !stored.weeks.includes(week);
    if (days.length === 0 && !weekDone) return;

    writeStoredValue(key, {
      days: [...stored.days.filter((day) => day >= today), ...days],
      weeks: [...stored.weeks.filter((monday) => monday >= week), ...(weekDone ? [week] : [])],
    });

    const day = days.at(-1);
    const message = weekDone
      ? t("celebration.week")
      : t("celebration.day", { day: dayLabel(day ?? today, now).toLocaleLowerCase(locale) });

    toast.success(message, {
      id: weekDone ? `celebration:week:${week}` : `celebration:day:${day ?? today}`,
      icon: (
        <CelebrationStamp burst>
          {weekDone ? <SparklesIcon /> : <CheckCheckIcon />}
        </CelebrationStamp>
      ),
    });
  }, [progress?.scope, progress?.completed]);
}

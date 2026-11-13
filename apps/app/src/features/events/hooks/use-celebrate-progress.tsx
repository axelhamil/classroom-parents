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
import { dayLabel, inSentence } from "../../../shared/format/deadline-label";
import { schoolToday } from "../../../shared/format/school-today";
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
  days: string[];
  weekDone: boolean;
}

export function useCelebrateProgress(now: Date): void {
  const { t } = useTranslation("events");
  const { user } = ProtectedRoute.useRouteContext();
  const query = useQuery(calendarEventsQueryOptions(weekAhead(schoolToday(now))));
  const toggling = useIsMutating({ mutationKey: markEventDoneMutationOptions.mutationKey }) > 0;
  const loaded = query.data ?? [];
  const week = mondayOf(schoolToday(now));
  const progress: Progress | null =
    query.isSuccess && !toggling
      ? {
          scope: [week, ...loaded.map((event) => event.id)].join(" "),
          days: completedDays(loaded),
          weekDone: loaded.length > 0 && loaded.every((event) => event.done),
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

    const freshDays = progress.days.filter((day) => !before.days.includes(day));
    const freshWeek = progress.weekDone && !before.weekDone;
    if (freshDays.length === 0 && !freshWeek) return;

    const today = schoolToday(now);
    const stored = readStoredValue(key, celebratedSchema, NONE);
    const days = freshDays.filter((day) => !stored.days.includes(day));
    const weekDone = freshWeek && !stored.weeks.includes(week);
    if (days.length === 0 && !weekDone) return;

    writeStoredValue(key, {
      days: [...stored.days.filter((day) => day >= today), ...days],
      weeks: [...stored.weeks.filter((monday) => monday >= week), ...(weekDone ? [week] : [])],
    });

    const day = days.at(-1);
    const message = weekDone
      ? t("celebration.week")
      : t("celebration.day", { day: inSentence(dayLabel(day ?? today, now)) });

    toast.success(message, {
      id: weekDone ? `celebration:week:${week}` : `celebration:day:${day ?? today}`,
      icon: (
        <CelebrationStamp burst>
          {weekDone ? <SparklesIcon /> : <CheckCheckIcon />}
        </CelebrationStamp>
      ),
    });
  }, [progress?.scope, progress?.days.join(" "), progress?.weekDone]);
}

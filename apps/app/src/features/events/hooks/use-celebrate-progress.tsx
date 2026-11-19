import { CelebrationStamp } from "@packages/ui/components/ui/celebration-stamp";
import {
  readStoredValue,
  userStorageKey,
  writeStoredValue,
} from "@packages/web-kit/storage/use-stored-value";
import { useIsMutating } from "@tanstack/react-query";
import { CheckCheckIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import { isDueWithin } from "../../../shared/agenda/deadline-facts";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { calendarWeek } from "../../../shared/agenda/windows";
import { markEventDoneMutationOptions } from "../../../shared/api/mutations/mark-event-done";
import type { EventItem } from "../../../shared/api/queries/events";
import { dayLabelFrom, inSentence } from "../../../shared/format/deadline-label";
import { useHomeEvents } from "./use-home-events";

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

/** Celebrates a day, or the calendar week (Monday to Sunday), the parent just finished ticking. */
export function useCelebrateProgress(clock: SchoolClock): void {
  const { t } = useTranslation("events");
  const { user } = ProtectedRoute.useRouteContext();
  const query = useHomeEvents(clock);
  const toggling = useIsMutating({ mutationKey: markEventDoneMutationOptions.mutationKey }) > 0;
  const range = calendarWeek.range(clock);
  const loaded = (query.data ?? []).filter((event) => isDueWithin(event, range));
  const week = range.from;
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

    const { today } = clock;
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
      : t("celebration.day", { day: inSentence(dayLabelFrom(day ?? today, today)) });

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

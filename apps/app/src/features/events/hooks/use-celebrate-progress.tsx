import { CelebrationStamp } from "@packages/ui/components/ui/celebration-stamp";
import {
  readStoredValue,
  userStorageKey,
  writeStoredValue,
} from "@packages/web-kit/storage/use-stored-value";
import { CheckCheckIcon, SparklesIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import type { EventItem } from "../../../shared/api/queries/events";
import { dayLabel } from "../../../shared/format/deadline-label";
import { schoolToday } from "../../../shared/format/school-today";
import { isInWeek, mondayOf } from "../week";
import { type ChecklistEntry, useChecklists } from "./use-checklist";
import { useWeekEvents } from "./use-week-events";

const LOCALE = "fr-FR";

const celebratedSchema = z.object({ days: z.array(z.string()), weeks: z.array(z.string()) });

type Celebrated = z.infer<typeof celebratedSchema>;

const NONE: Celebrated = { days: [], weeks: [] };

function isReady(event: EventItem, items: readonly ChecklistEntry[]): boolean {
  return event.done || (items.length > 0 && items.every((item) => item.done));
}

function completedDays(events: readonly EventItem[], ready: readonly boolean[]): string[] {
  const dates = [...new Set(events.map((event) => event.deadlineDate))];

  return dates.filter((date) =>
    events.every((event, index) => event.deadlineDate !== date || ready[index]),
  );
}

interface Progress {
  scope: string;
  completed: string;
}

export function useCelebrateProgress(now: Date): void {
  const { t } = useTranslation("events");
  const { user } = ProtectedRoute.useRouteContext();
  const query = useWeekEvents(now);
  const loaded = (query.data?.pages.flatMap((page) => page.items) ?? []).filter((event) =>
    isInWeek(event.deadlineDate, now),
  );
  const checklists = useChecklists(loaded);
  const ready = loaded.map((event, index) => isReady(event, checklists[index] ?? []));
  const week = mondayOf(now);
  const progress: Progress | null = query.isSuccess
    ? {
        scope: [week, ...loaded.map((event) => `${event.id}:${event.done}`)].join("\n"),
        completed: [
          ...completedDays(loaded, ready),
          ...(loaded.length > 0 && ready.every(Boolean) ? [`week:${week}`] : []),
        ].join("\n"),
      }
    : null;
  const previous = useRef<Progress | null>(null);
  const key = userStorageKey(user.id, "celebrations");

  // biome-ignore lint/correctness/useExhaustiveDependencies: a celebration answers a checklist the parent ticked, so only a change of what is complete within the same events counts
  useEffect(() => {
    const before = previous.current;
    previous.current = progress;
    if (!before || !progress || before.scope !== progress.scope) return;

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
      : t("celebration.day", { day: dayLabel(day ?? today, now).toLocaleLowerCase(LOCALE) });

    toast.success(message, {
      id: weekDone ? `celebration:week:${week}` : `celebration:day:${day ?? today}`,
      icon: <CelebrationStamp>{weekDone ? <SparklesIcon /> : <CheckCheckIcon />}</CelebrationStamp>,
    });
  }, [progress?.scope, progress?.completed]);
}

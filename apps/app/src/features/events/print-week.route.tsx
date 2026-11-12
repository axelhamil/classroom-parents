import { wallDateLabel } from "@packages/i18n";
import { Button } from "@packages/ui/components/ui/button";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import {
  PrintSheet,
  PrintSheetFooter,
  PrintSheetHeader,
  PrintSheetSubtitle,
  PrintSheetTitle,
} from "@packages/ui/components/ui/print-planner";
import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import { cn } from "@packages/ui/libs/utils.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PrinterIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../shared/api/queries/children";
import type { EventItem } from "../../shared/api/queries/events";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { EventBoardSkeleton } from "../../shared/events/event-board";
import { schoolToday } from "../../shared/format/school-today";
import { QueryState } from "../../shared/query/query-state";
import { FridgePlanner } from "./components/fridge-planner";
import { printWeekSearchSchema } from "./events.schema";
import { useNow } from "./hooks/use-now";
import { useWeekEvents, type WeekRange } from "./hooks/use-week-events";
import { defaultPrintWeek, PRINT_WEEKS, type PrintWeek, printWeekDates } from "./week";

export const Route = createFileRoute("/_protected/_shell/week/print")({
  validateSearch: printWeekSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: PrintWeekPage,
});

const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function dayOf(date: string): string {
  return DAY_MONTH.format(new Date(`${date}T00:00:00Z`));
}

function rangeOf(first: string, last: string): { from: string; to: string } {
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);

  return { from: sameMonth ? String(Number(first.slice(8))) : dayOf(first), to: dayOf(last) };
}

interface EventPages {
  pages: readonly { items: readonly EventItem[] }[];
}

function eventsOfWeek(sources: readonly EventPages[], range: WeekRange): EventItem[] {
  const byId = new Map<string, EventItem>();
  for (const source of sources)
    for (const page of source.pages)
      for (const event of page.items)
        if (event.deadlineDate >= range.from && event.deadlineDate <= range.to)
          byId.set(event.id, event);

  return [...byId.values()].sort((a, b) => a.deadlineAt.localeCompare(b.deadlineAt));
}

function PrintWeekPage() {
  const { t } = useTranslation("events");
  const { t: tCommon } = useTranslation("common");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useNow();
  const today = schoolToday(now);
  const week = search.week ?? defaultPrintWeek(now);
  const dates = printWeekDates(now, week);
  const first = dates[0] ?? today;
  const last = dates.at(-1) ?? today;
  const range = { from: first, to: last };
  const children = useQuery(childrenQueryOptions);
  const upcoming = useWeekEvents("upcoming", range);
  const past = useWeekEvents("history", range);
  const title = t("print.title", rangeOf(first, last));
  const loading = <EventBoardSkeleton label={t("print.loading")} />;

  const selectWeek = (value: string) => {
    const next = PRINT_WEEKS.find((candidate): candidate is PrintWeek => candidate === value);
    if (next) void navigate({ search: { week: next }, replace: true });
  };

  return (
    <main
      className={cn(
        pageContainerVariants({ width: "app" }),
        "flex flex-1 flex-col gap-6 pt-2 pb-10 md:pt-4 md:pb-12 print:max-w-none print:p-0",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ToggleGroup
          type="single"
          variant="chip"
          size="touch"
          spacing={2}
          aria-label={t("print.weeks.label")}
          value={week}
          onValueChange={selectWeek}
        >
          {PRINT_WEEKS.map((candidate) => (
            <ToggleGroupItem key={candidate} value={candidate}>
              {t(`print.weeks.${candidate}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" onClick={() => window.print()}>
          <PrinterIcon aria-hidden />
          {t("print.print")}
        </Button>
      </div>
      <PrintSheet>
        <PrintSheetHeader className="print:hidden">
          <PrintSheetTitle>{title}</PrintSheetTitle>
          <PrintSheetSubtitle>{t("print.subtitle")}</PrintSheetSubtitle>
        </PrintSheetHeader>
        <QueryState query={children} skeleton={loading}>
          {(family) => (
            <QueryState query={upcoming} skeleton={loading}>
              {(later) => (
                <QueryState query={past} skeleton={loading}>
                  {(earlier) => (
                    <FridgePlanner
                      title={title}
                      subtitle={t("print.subtitle")}
                      family={family}
                      events={eventsOfWeek([earlier, later], range)}
                      now={now}
                    />
                  )}
                </QueryState>
              )}
            </QueryState>
          )}
        </QueryState>
        <PrintSheetFooter>
          <span>{tCommon("brand")}</span>
          <span>{t("print.printedOn", { date: wallDateLabel(today, today) })}</span>
        </PrintSheetFooter>
      </PrintSheet>
    </main>
  );
}

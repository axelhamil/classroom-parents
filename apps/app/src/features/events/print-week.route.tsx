import { wallDateLabel, withWallTime } from "@packages/i18n";
import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import {
  PrintPlanner,
  PrintPlannerBox,
  PrintPlannerColumn,
  PrintPlannerColumnTitle,
  PrintPlannerEmpty,
  PrintPlannerItem,
  PrintPlannerItemMeta,
  PrintPlannerItemTitle,
  PrintPlannerList,
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
import { type ChildDto, childrenQueryOptions } from "../../shared/api/queries/children";
import type { EventItem } from "../../shared/api/queries/events";
import { redirectToOnboardingWithoutChild } from "../../shared/children/redirect-to-onboarding";
import { EventBoardSkeleton } from "../../shared/events/event-board";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "../../shared/events/event-labels";
import { childHue } from "../../shared/format/child-hue";
import { daysUntil, wallDateParts } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import { QueryState } from "../../shared/query/query-state";
import { printWeekSearchSchema } from "./events.schema";
import { useNow } from "./hooks/use-now";
import { useWeekEvents } from "./hooks/use-week-events";
import { defaultPrintWeek, PRINT_WEEKS, type PrintWeek, printWeekDates } from "./week";

export const Route = createFileRoute("/_protected/_shell/week/print")({
  validateSearch: printWeekSearchSchema,
  beforeLoad: redirectToOnboardingWithoutChild,
  component: PrintWeekPage,
});

const COLUMNS = [1, 2, 3, 4] as const;

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
  const children = useQuery(childrenQueryOptions);
  const events = useWeekEvents(last);

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
        <PrintSheetHeader>
          <PrintSheetTitle>{t("print.title", rangeOf(first, last))}</PrintSheetTitle>
          <PrintSheetSubtitle>{t("print.subtitle")}</PrintSheetSubtitle>
        </PrintSheetHeader>
        <QueryState query={children} skeleton={<EventBoardSkeleton label={t("print.loading")} />}>
          {(family) => (
            <QueryState query={events} skeleton={<EventBoardSkeleton label={t("print.loading")} />}>
              {(data) => (
                <FamilyColumns
                  family={family}
                  events={data.pages
                    .flatMap((page) => page.items)
                    .filter((event) => event.deadlineDate >= first && event.deadlineDate <= last)}
                  now={now}
                />
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

interface FamilyColumnsProps {
  family: readonly ChildDto[];
  events: readonly EventItem[];
  now: Date;
}

function FamilyColumns({ family, events, now }: FamilyColumnsProps) {
  const { t } = useTranslation("events");
  const { t: tCommon } = useTranslation("common");

  const countdown = (date: string) => {
    const days = daysUntil(date, now);
    if (days <= 0) return tCommon("deadline.today");
    if (days === 1) return tCommon("deadline.tomorrow");

    return t("countdown.inDays", { count: days });
  };

  return (
    <PrintPlanner columns={COLUMNS[Math.min(family.length, COLUMNS.length) - 1]}>
      {family.map((child) => {
        const hue = childHue(family, child.id);
        const titleId = `print-child-${child.id}`;
        const childEvents = events.filter((event) => event.childId === child.id);

        return (
          <PrintPlannerColumn key={child.id} hue={hue} aria-labelledby={titleId}>
            <PrintPlannerColumnTitle id={titleId}>
              <ChildAvatar name={child.label} tone={hue} size="sm" />
              {child.label}
            </PrintPlannerColumnTitle>
            {childEvents.length === 0 ? (
              <PrintPlannerEmpty>{t("print.empty")}</PrintPlannerEmpty>
            ) : (
              <PrintPlannerList>
                {childEvents.map((event) => {
                  const CategoryIcon = CATEGORY_ICONS[event.category];

                  return (
                    <PrintPlannerItem key={event.id}>
                      <PrintPlannerBox />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <PrintPlannerItemTitle>{event.title}</PrintPlannerItemTitle>
                        <PrintPlannerItemMeta>
                          <span>
                            {withWallTime(
                              t("print.date", { ...wallDateParts(event.deadlineDate) }),
                              event.deadlineTime,
                            )}
                          </span>
                          <span>{countdown(event.deadlineDate)}</span>
                          <span className="flex items-center gap-1">
                            <CategoryIcon aria-hidden />
                            {t(CATEGORY_LABEL_KEYS[event.category])}
                          </span>
                        </PrintPlannerItemMeta>
                      </span>
                    </PrintPlannerItem>
                  );
                })}
              </PrintPlannerList>
            )}
          </PrintPlannerColumn>
        );
      })}
    </PrintPlanner>
  );
}

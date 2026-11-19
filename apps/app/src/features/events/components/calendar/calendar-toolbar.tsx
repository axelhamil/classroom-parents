import { utcDay } from "@packages/i18n";
import { Button } from "@packages/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/ui/dropdown-menu";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { TabsList, TabsTrigger } from "@packages/ui/components/ui/tabs";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import {
  CalendarSyncIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisIcon,
  HistoryIcon,
  PlusIcon,
  PrinterIcon,
  Share2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgendaCourse, AgendaSummary } from "../../../../shared/agenda/calendar-days";
import { useIntlLocale } from "../../../../shared/i18n/use-intl-locale";
import { CALENDAR_VIEWS, type CalendarPeriod, type CalendarView } from "../../calendar";
import type { SwipeStep } from "../../hooks/use-swipe";
import { CourseFilter } from "./course-filter";
import { useSummaryLabel } from "./use-summary-label";

export interface CalendarToolbarProps {
  view: CalendarView;
  anchor: string;
  period: CalendarPeriod;
  todayInView: boolean;
  summary: AgendaSummary;
  settled: boolean;
  courses: readonly AgendaCourse[];
  courseId: string | null;
  onCourseChange: (courseId: string | null) => void;
  onStep: (step: SwipeStep) => void;
  onToday: () => void;
  onAdd: () => void;
  onShare: () => void;
  onSubscribe: () => void;
}

function usePeriodLabel(view: CalendarView, anchor: string, { from, to }: CalendarPeriod): string {
  const { t } = useTranslation("events");
  const locale = useIntlLocale();
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(utcDay(date));

  if (view === "month")
    return format(`${anchor.slice(0, 7)}-01`, { month: "long", year: "numeric" });

  const sameMonth = from.slice(0, 7) === to.slice(0, 7);

  return t("calendar.range", {
    from: format(from, sameMonth ? { day: "numeric" } : { day: "numeric", month: "long" }),
    to: format(to, { day: "numeric", month: "long" }),
  });
}

export function CalendarToolbar({
  view,
  anchor,
  period,
  todayInView,
  summary,
  settled,
  courses,
  courseId,
  onCourseChange,
  onStep,
  onToday,
  onAdd,
  onShare,
  onSubscribe,
}: CalendarToolbarProps) {
  const { t } = useTranslation("events");
  const label = usePeriodLabel(view, anchor, period);
  const summaryLabel = useSummaryLabel()(summary);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3 [grid-template-areas:'title_actions''views_nav'] @xl:grid-cols-[auto_minmax(0,1fr)_auto_auto] @xl:gap-x-4 @xl:[grid-template-areas:'nav_title_views_actions']">
      <div className="flex min-w-0 flex-col items-start [grid-area:title]">
        <TypographyH2 variant="section">{label}</TypographyH2>
        <TypographyMuted>{summaryLabel}</TypographyMuted>
        {!todayInView && (
          <Button
            variant="link"
            className="h-auto min-h-control px-0 @5xl:hidden"
            onClick={onToday}
          >
            {t("calendar.backToToday")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1 justify-self-end [grid-area:nav] @xl:justify-self-start">
        <IconButton variant="outline" label={t("calendar.previous")} onClick={() => onStep(-1)}>
          <ChevronLeftIcon aria-hidden />
        </IconButton>
        {!todayInView && (
          <Button variant="outline" className="@max-5xl:hidden" onClick={onToday}>
            {t("calendar.today")}
          </Button>
        )}
        <IconButton variant="outline" label={t("calendar.next")} onClick={() => onStep(1)}>
          <ChevronRightIcon aria-hidden />
        </IconButton>
      </div>
      <TabsList
        aria-label={t("calendar.views.label")}
        data-tour="home-tabs"
        className="justify-self-start [grid-area:views]"
      >
        {CALENDAR_VIEWS.map((candidate) => (
          <TabsTrigger key={candidate} value={candidate}>
            {t(`calendar.views.${candidate}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      <div data-tour="home-share" className="flex items-center gap-1 [grid-area:actions]">
        <CourseFilter courses={courses} courseId={courseId} onCourseChange={onCourseChange} />
        <Button onClick={onAdd}>
          <PlusIcon aria-hidden />
          <span className="@max-5xl:sr-only">{t("calendar.add")}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outline" label={t("calendar.more")}>
              <EllipsisIcon aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onShare}>
              <Share2Icon aria-hidden />
              {t("week.share")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/week/print">
                <PrinterIcon aria-hidden />
                {t("print.action")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onSubscribe}>
              <CalendarSyncIcon aria-hidden />
              {t("calendar.feed.action")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/" search={{ tab: "history" }}>
                <HistoryIcon aria-hidden />
                {t("calendar.history")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="sr-only" aria-live="polite">
        {settled ? t("calendar.announce", { period: label, summary: summaryLabel }) : ""}
      </p>
    </div>
  );
}

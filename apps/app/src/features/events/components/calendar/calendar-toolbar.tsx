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
import { TypographyH2 } from "@packages/ui/components/ui/typography";
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
import { useIntlLocale } from "../../../../shared/i18n/use-intl-locale";
import { CALENDAR_VIEWS, type CalendarPeriod, type CalendarView } from "../../calendar";
import type { SwipeStep } from "../../hooks/use-swipe";

export interface CalendarToolbarProps {
  view: CalendarView;
  anchor: string;
  period: CalendarPeriod;
  todayInView: boolean;
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
  onStep,
  onToday,
  onAdd,
  onShare,
  onSubscribe,
}: CalendarToolbarProps) {
  const { t } = useTranslation("events");
  const label = usePeriodLabel(view, anchor, period);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <TypographyH2 variant="section" aria-live="polite" className="min-w-0 flex-1 basis-32">
        {label}
      </TypographyH2>
      <div className="flex items-center gap-1">
        <IconButton variant="outline" label={t("calendar.previous")} onClick={() => onStep(-1)}>
          <ChevronLeftIcon aria-hidden />
        </IconButton>
        <Button variant="outline" disabled={todayInView} onClick={onToday}>
          {t("calendar.today")}
        </Button>
        <IconButton variant="outline" label={t("calendar.next")} onClick={() => onStep(1)}>
          <ChevronRightIcon aria-hidden />
        </IconButton>
      </div>
      <div className="flex w-full items-center gap-2 @3xl:w-auto">
        <TabsList
          size="touch"
          aria-label={t("calendar.views.label")}
          data-tour="home-tabs"
          className="flex-1 @3xl:flex-none"
        >
          {CALENDAR_VIEWS.map((candidate) => (
            <TabsTrigger key={candidate} value={candidate}>
              {t(`calendar.views.${candidate}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <div data-tour="home-share" className="flex items-center gap-1">
          <Button onClick={onAdd}>
            <PlusIcon aria-hidden />
            {t("calendar.add")}
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
      </div>
    </div>
  );
}

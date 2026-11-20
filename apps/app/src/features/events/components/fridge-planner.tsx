import { withWallTime } from "@packages/i18n";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
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
  PrintSheetSubtitle,
  PrintTable,
  PrintTableCell,
  PrintTableChild,
  PrintTableTitle,
  PrintTableTitleText,
} from "@packages/ui/components/ui/print-planner";
import { useTranslation } from "react-i18next";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "../../../shared/events/event-labels";
import { childHue } from "../../../shared/format/child-hue";
import { dayLabel, daysBetween, wallDateParts } from "../../../shared/format/deadline-label";

const COLUMNS = [1, 2, 3, 4] as const;
const DENSE_FROM = 8;

export interface FridgePlannerProps {
  title: string;
  subtitle: string;
  family: readonly ChildDto[];
  events: readonly EventItem[];
  clock: PlannerClock;
}

type PlannerClock = Pick<SchoolClock, "now" | "today">;

interface ChildColumn {
  child: ChildDto;
  hue: ReturnType<typeof childHue>;
  events: EventItem[];
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

export function FridgePlanner({ title, subtitle, family, events, clock }: FridgePlannerProps) {
  const columns: ChildColumn[] = family.map((child) => ({
    child,
    hue: childHue(family, child.id),
    events: events.filter((event) => event.childId === child.id),
  }));
  const dense = columns.some((column) => column.events.length >= DENSE_FROM);
  const perRow = COLUMNS[Math.min(family.length, COLUMNS.length) - 1] ?? COLUMNS.length;

  return (
    <>
      <PrintPlanner columns={perRow} className="print:hidden">
        {columns.map(({ child, hue, events: childEvents }) => {
          const titleId = `print-child-${child.id}`;

          return (
            <PrintPlannerColumn key={child.id} hue={hue} aria-labelledby={titleId}>
              <PrintPlannerColumnTitle id={titleId}>
                <ChildAvatar name={child.label} tone={hue} size="sm" />
                {child.label}
              </PrintPlannerColumnTitle>
              <Deadlines events={childEvents} clock={clock} />
            </PrintPlannerColumn>
          );
        })}
      </PrintPlanner>
      {chunksOf(columns, perRow).map((row) => (
        <PrintTable key={row[0]?.child.id} density={dense ? "compact" : "regular"}>
          <thead>
            <tr>
              <PrintTableTitle colSpan={perRow}>
                <PrintTableTitleText>{title}</PrintTableTitleText>
                <PrintSheetSubtitle>{subtitle}</PrintSheetSubtitle>
              </PrintTableTitle>
            </tr>
            <tr>
              {row.map(({ child, hue }) => (
                <PrintTableChild key={child.id} hue={hue}>
                  <ChildAvatar name={child.label} tone={hue} size="sm" />
                  {child.label}
                </PrintTableChild>
              ))}
              {row.length < perRow && <PrintTableCell colSpan={perRow - row.length} />}
            </tr>
          </thead>
          <tbody>
            <tr>
              {row.map(({ child, events: childEvents }) => (
                <PrintTableCell key={child.id}>
                  <Deadlines events={childEvents} clock={clock} />
                </PrintTableCell>
              ))}
              {row.length < perRow && <PrintTableCell colSpan={perRow - row.length} />}
            </tr>
          </tbody>
        </PrintTable>
      ))}
    </>
  );
}

interface DeadlinesProps {
  events: readonly EventItem[];
  clock: PlannerClock;
}

function Deadlines({ events, clock }: DeadlinesProps) {
  const { t } = useTranslation("events");

  const countdown = (event: EventItem, past: boolean) => {
    if (past) return t("print.past");
    const days = daysBetween(clock.today, event.deadlineDate);
    if (days <= 1) return dayLabel(event.deadlineDate, clock.today);

    return t("countdown.inDays", { count: days });
  };

  if (events.length === 0) return <PrintPlannerEmpty>{t("print.empty")}</PrintPlannerEmpty>;

  return (
    <PrintPlannerList>
      {events.map((event) => {
        const CategoryIcon = CATEGORY_ICONS[event.category];
        const past = Date.parse(event.deadlineAt) < clock.now.getTime();

        return (
          <PrintPlannerItem key={event.id} past={past}>
            <PrintPlannerBox past={past} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <PrintPlannerItemTitle>{event.title}</PrintPlannerItemTitle>
              <PrintPlannerItemMeta>
                <span>
                  {withWallTime(
                    t("print.date", { ...wallDateParts(event.deadlineDate) }),
                    event.deadlineTime,
                  )}
                </span>
                <span>{countdown(event, past)}</span>
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
  );
}

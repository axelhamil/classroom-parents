import { shiftDate } from "@packages/ddd-kit/days";
import { useQuery } from "@tanstack/react-query";
import { BusIcon, type LucideIcon, PenLineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EventCategory } from "../../../../shared/events/event-labels";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockContext, HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { BlockPanel } from "./block-panel";
import { EventRows, forChild } from "./event-rows";

export const UPCOMING_DAYS = 14;

export function upcomingWindow(today: string, days = UPCOMING_DAYS) {
  return { from: today, to: shiftDate(today, days - 1) };
}

export interface UpcomingEventsProps extends HomeBlockContext {
  title: string;
  rows: number;
  icon: LucideIcon;
  categories: readonly EventCategory[];
  empty: string;
}

export function UpcomingEvents({
  family,
  childId,
  now,
  title,
  rows,
  icon,
  categories,
  empty,
}: UpcomingEventsProps) {
  const today = schoolToday(now);
  const query = useQuery(calendarEventsQueryOptions(upcomingWindow(today)));
  const due = forChild(query.data ?? [], childId).filter(
    (event) => !event.done && categories.includes(event.category),
  );

  return (
    <BlockPanel title={title} icon={icon} note={query.isSuccess && due.length === 0 && empty}>
      {due.length > 0 && (
        <EventRows events={due} family={family} now={now} today={today} rows={rows} />
      )}
    </BlockPanel>
  );
}

const UPCOMING_CATEGORIES = {
  documents: ["document_due"],
  outings: ["school_trip", "swimming"],
} as const satisfies Record<string, readonly EventCategory[]>;

type UpcomingBlockId = keyof typeof UPCOMING_CATEGORIES;

function isUpcoming(id: string): id is UpcomingBlockId {
  return id in UPCOMING_CATEGORIES;
}

function UpcomingBlock({ blockId, title, rows, ...context }: HomeBlockProps) {
  const { t } = useTranslation("home");
  if (!isUpcoming(blockId)) return null;

  return (
    <UpcomingEvents
      {...context}
      title={title}
      rows={rows}
      icon={ICONS[blockId]}
      categories={UPCOMING_CATEGORIES[blockId]}
      empty={t(`blocks.${blockId}.empty`)}
    />
  );
}

const ICONS: Record<UpcomingBlockId, LucideIcon> = {
  documents: PenLineIcon,
  outings: BusIcon,
};

/** Documents and outings are one list of the coming two weeks, cut by category. */
export function upcomingBlock(id: UpcomingBlockId): HomeBlockDefinition {
  return {
    id,
    titleKey: `blocks.${id}.title`,
    descriptionKey: `blocks.${id}.description`,
    icon: ICONS[id],
    sizes: { w: [3, 4, 6, 8], h: [1, 2, 3] },
    defaultSize: { w: 4, h: 1 },
    Component: UpcomingBlock,
  };
}

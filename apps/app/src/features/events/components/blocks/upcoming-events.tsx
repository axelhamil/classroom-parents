import { BusIcon, ClipboardCheckIcon, type LucideIcon, PenLineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type DeadlineKind, upcomingByKind } from "../../../../shared/agenda/views";
import { nextTwoWeeks } from "../../../../shared/agenda/windows";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { EventSteps } from "../prepare-checklist";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

const ICONS: Record<DeadlineKind, LucideIcon> = {
  assessments: ClipboardCheckIcon,
  documents: PenLineIcon,
  outings: BusIcon,
};

function isDeadlineKind(id: string): id is DeadlineKind {
  return id in ICONS;
}

function UpcomingBlock({ blockId, family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  if (!isDeadlineKind(blockId)) return null;

  const due = upcomingByKind(query.data ?? [], clock, blockId, childId);
  const empty = t(`blocks.${blockId}.empty`, { days: nextTwoWeeks.days });

  return (
    <BlockPanel
      title={title}
      icon={ICONS[blockId]}
      note={query.isSuccess && due.length === 0 && empty}
    >
      {due.length > 0 && (
        <EventRows
          events={due}
          family={family}
          steps={blockId === "assessments" ? (event) => <EventSteps event={event} /> : undefined}
        />
      )}
    </BlockPanel>
  );
}

/** Assessments, documents and outings are one list of the coming two weeks, cut by kind. */
export function upcomingBlock(id: DeadlineKind): HomeBlockDefinition {
  return {
    id,
    titleKey: `blocks.${id}.title`,
    descriptionKey: `blocks.${id}.description`,
    windowDays: nextTwoWeeks.days,
    icon: ICONS[id],
    Component: UpcomingBlock,
  };
}

import {
  AssessmentIcon,
  DocumentDueIcon,
  type Icon,
  SchoolTripIcon,
} from "@packages/ui/components/ui/icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DEADLINE_KINDS, type DeadlineKind, upcomingByKind } from "../../../../shared/agenda/views";
import { nextTwoWeeks } from "../../../../shared/agenda/windows";
import { useTileSizeClass } from "../../../../shared/dashboard/tile-size-class";
import { nextOfCategoriesQueryOptions } from "../../api/events.queries";
import { blockIsEmpty } from "../../block-emptiness";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { EventSteps } from "../prepare-checklist";
import { BlockEmpty, NextDeadlineLink } from "./block-empty";
import { BlockGlance } from "./block-glance";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

const ICONS: Record<DeadlineKind, Icon> = {
  assessments: AssessmentIcon,
  documents: DocumentDueIcon,
  outings: SchoolTripIcon,
};

function isDeadlineKind(id: string): id is DeadlineKind {
  return id in ICONS;
}

function UpcomingBlock({ blockId, family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const glance = useTileSizeClass() === "glance";
  if (!isDeadlineKind(blockId)) return null;

  const events = query.data ?? [];
  const due = upcomingByKind(events, clock, blockId, childId);

  return (
    <BlockPanel title={title} icon={ICONS[blockId]} fits={glance}>
      {query.isSuccess && blockIsEmpty(blockId, { events, clock, childId }) && (
        <NothingOfKind kind={blockId} childId={childId} today={clock.today} />
      )}
      {due.length > 0 && glance && (
        <BlockGlance
          events={due}
          label={(count) => t(`blocks.${blockId}.count`, { count })}
          today={clock.today}
        />
      )}
      {due.length > 0 && !glance && (
        <EventRows
          events={due}
          family={family}
          steps={blockId === "assessments" ? (event) => <EventSteps event={event} /> : undefined}
        />
      )}
    </BlockPanel>
  );
}

interface NothingOfKindProps {
  kind: DeadlineKind;
  childId: string | null;
  today: string;
}

function NothingOfKind({ kind, childId, today }: NothingOfKindProps) {
  const { t } = useTranslation("home");
  const next = useQuery(nextOfCategoriesQueryOptions(DEADLINE_KINDS[kind], childId)).data;

  return (
    <BlockEmpty
      icon={ICONS[kind]}
      title={t(`blocks.${kind}.empty`, { days: nextTwoWeeks.days })}
      hint={
        next ? (
          <NextDeadlineLink
            event={next}
            today={today}
            sentence={(fields) => t(`blocks.${kind}.next`, fields)}
          />
        ) : (
          t(`blocks.${kind}.emptyHint`)
        )
      }
    />
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

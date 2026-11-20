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
import { nextOfCategoriesQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { EventSteps } from "../prepare-checklist";
import { BlockEmpty, NextDeadlineLink } from "./block-empty";
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
  const query = useHomeEvents(clock);
  if (!isDeadlineKind(blockId)) return null;

  const due = upcomingByKind(query.data ?? [], clock, blockId, childId);

  return (
    <BlockPanel title={title} icon={ICONS[blockId]}>
      {query.isSuccess && due.length === 0 && (
        <NothingOfKind kind={blockId} childId={childId} today={clock.today} />
      )}
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

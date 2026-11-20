import { relativeDayLabel } from "@packages/i18n";
import {
  BriefingGroup,
  BriefingGroupHeader,
  BriefingGroups,
  BriefingGroupTitle,
  BriefingItem,
  BriefingList,
} from "@packages/ui/components/ui/briefing";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { AllDoneIcon, NothingDueIcon, PackBagIcon } from "@packages/ui/components/ui/icons";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { type DayPlan, nextOpenAfter, tonightView } from "../../../../shared/agenda/views";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../../shared/children/child-avatar-src";
import { childHue } from "../../../../shared/format/child-hue";
import { inSentence } from "../../../../shared/format/deadline-label";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useChecklist } from "../../hooks/use-checklist";
import { useHomeEvents } from "../../hooks/use-home-events";
import { StepLists } from "../prepare-checklist";
import { BlockEmpty, NextDeadlineLink } from "./block-empty";
import { BlockPanel } from "./block-panel";

function TonightBlock({ family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const plan = tonightView(query.data ?? [], clock, childId);
  const day = inSentence(relativeDayLabel(plan.day, clock.today));
  const withSteps = [...plan.toPrepare, ...plan.suggested];
  const note = plan.toPrepare.length > 0 ? "blocks.tonight.day" : "blocks.tonight.suggested";

  return (
    <BlockPanel
      title={title}
      icon={PackBagIcon}
      note={query.isSuccess && withSteps.length > 0 && t(note, { day })}
      hero
    >
      {query.isSuccess && withSteps.length === 0 && (
        <NothingToPack
          events={query.data}
          plan={plan}
          day={day}
          childId={childId}
          today={clock.today}
        />
      )}
      {withSteps.length > 0 && (
        <BriefingGroups>
          {family.map((child) => {
            const own = withSteps.filter((event) => event.childId === child.id);
            if (own.length === 0) return null;

            return <ChildActions key={child.id} child={child} events={own} family={family} />;
          })}
        </BriefingGroups>
      )}
    </BlockPanel>
  );
}

interface NothingToPackProps {
  events: readonly EventItem[];
  plan: DayPlan;
  day: string;
  childId: string | null;
  today: string;
}

function NothingToPack({ events, plan, day, childId, today }: NothingToPackProps) {
  const { t } = useTranslation("home");
  const count = plan.deadlines.length;
  if (count > 0)
    return (
      <BlockEmpty
        icon={AllDoneIcon}
        title={t("blocks.tonight.ready")}
        hint={t("blocks.tonight.readyHint", { count, day })}
      />
    );

  const next = nextOpenAfter(events, plan.day, childId);

  return (
    <BlockEmpty
      icon={NothingDueIcon}
      title={t("blocks.tonight.empty", { day })}
      hint={
        next ? (
          <NextDeadlineLink
            event={next}
            today={today}
            sentence={(fields) => t("blocks.next", fields)}
          />
        ) : (
          t("blocks.tonight.emptyHint")
        )
      }
    />
  );
}

interface ChildActionsProps {
  child: ChildDto;
  events: readonly EventItem[];
  family: readonly ChildDto[];
}

function ChildActions({ child, events, family }: ChildActionsProps) {
  const titleId = useId();

  return (
    <BriefingGroup aria-labelledby={titleId}>
      <BriefingGroupHeader>
        <ChildAvatar
          name={child.label}
          tone={childHue(family, child.id)}
          src={childAvatarSrc(child)}
          size="sm"
        />
        <BriefingGroupTitle id={titleId}>{child.label}</BriefingGroupTitle>
      </BriefingGroupHeader>
      <BriefingList>
        {events.map((event) => (
          <BriefingItem key={event.id}>
            <EventActions event={event} />
          </BriefingItem>
        ))}
      </BriefingList>
    </BriefingGroup>
  );
}

interface EventActionsProps {
  event: EventItem;
}

function EventActions({ event }: EventActionsProps) {
  const checklist = useChecklist(event);

  return (
    <>
      <TypographyMuted>{event.title}</TypographyMuted>
      <StepLists checklist={checklist} />
    </>
  );
}

export const tonightBlock: HomeBlockDefinition = {
  id: "tonight",
  titleKey: "blocks.tonight.title",
  descriptionKey: "blocks.tonight.description",
  icon: PackBagIcon,
  Component: TonightBlock,
};

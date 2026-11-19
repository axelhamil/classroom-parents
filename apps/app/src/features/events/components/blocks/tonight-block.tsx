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
import { PackBagIcon } from "@packages/ui/components/ui/icons";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import type { TFunction } from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { type DayPlan, tonightView } from "../../../../shared/agenda/views";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../../shared/children/child-avatar-src";
import { childHue } from "../../../../shared/format/child-hue";
import { inSentence } from "../../../../shared/format/deadline-label";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useChecklist } from "../../hooks/use-checklist";
import { useHomeEvents } from "../../hooks/use-home-events";
import { StepLists } from "../prepare-checklist";
import { BlockPanel } from "./block-panel";
import { ShowMoreButton, useShowMore } from "./show-more";

function tonightNote(plan: DayPlan, day: string, t: TFunction<"home">): string {
  if (plan.toPrepare.length > 0) return t("blocks.tonight.day", { day });
  if (plan.suggested.length > 0) return t("blocks.tonight.suggested", { day });
  if (plan.deadlines.length > 0)
    return t("blocks.tonight.ready", { count: plan.deadlines.length, day });

  return t("blocks.tonight.empty", { day });
}

function TonightBlock({ family, childId, clock, title, rows }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const plan = tonightView(query.data ?? [], clock, childId);
  const day = inSentence(relativeDayLabel(plan.day, clock.today));
  const withSteps = [...plan.toPrepare, ...plan.suggested];

  return (
    <BlockPanel
      title={title}
      icon={PackBagIcon}
      note={query.isSuccess && tonightNote(plan, day, t)}
      hero
    >
      {withSteps.length > 0 && (
        <BriefingGroups>
          {family.map((child) => {
            const own = withSteps.filter((event) => event.childId === child.id);
            if (own.length === 0) return null;

            return (
              <ChildActions key={child.id} child={child} events={own} family={family} rows={rows} />
            );
          })}
        </BriefingGroups>
      )}
    </BlockPanel>
  );
}

interface ChildActionsProps {
  child: ChildDto;
  events: readonly EventItem[];
  family: readonly ChildDto[];
  rows: number;
}

function ChildActions({ child, events, family, rows }: ChildActionsProps) {
  const titleId = useId();
  const listId = useId();
  const { shown, more } = useShowMore(events, rows);

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
      <BriefingList id={listId}>
        {shown.map((event) => (
          <BriefingItem key={event.id}>
            <EventActions event={event} />
          </BriefingItem>
        ))}
      </BriefingList>
      <ShowMoreButton more={more} controls={listId} />
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
  sizes: { w: [3, 4, 6, 8], h: [1, 2, 3] },
  defaultSize: { w: 4, h: 1 },
  Component: TonightBlock,
};

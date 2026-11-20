import { relativeDayLabel } from "@packages/i18n";
import { DashboardPanelEmpty } from "@packages/ui/components/ui/dashboard";
import { IconTile } from "@packages/ui/components/ui/icon-tile";
import type { Icon } from "@packages/ui/components/ui/icons";
import { TextLink } from "@packages/ui/components/ui/text-link";
import type { ReactNode, Ref } from "react";
import type { EventItem } from "../../../../shared/api/queries/events";
import { EventLink } from "../../../../shared/events/event-link";
import { inSentence } from "../../../../shared/format/deadline-label";

export interface BlockEmptyProps {
  icon: Icon;
  title: string;
  hint: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function BlockEmpty({ icon: Icon, title, hint, ref }: BlockEmptyProps) {
  return (
    <DashboardPanelEmpty ref={ref} tabIndex={-1}>
      <IconTile>
        <Icon aria-hidden />
      </IconTile>
      <p>{title}</p>
      <p>{hint}</p>
    </DashboardPanelEmpty>
  );
}

export interface NextDeadlineLinkProps {
  event: Pick<EventItem, "id" | "title" | "deadlineDate">;
  today: string;
  sentence: (fields: { title: string; when: string }) => string;
}

export function NextDeadlineLink({ event, today, sentence }: NextDeadlineLinkProps) {
  const when = inSentence(relativeDayLabel(event.deadlineDate, today));

  return (
    <TextLink asChild>
      <EventLink eventId={event.id}>{sentence({ title: event.title, when })}</EventLink>
    </TextLink>
  );
}

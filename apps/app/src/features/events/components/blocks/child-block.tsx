import { AllDoneIcon, ChildIcon, NothingDueIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { childAgendaView } from "../../../../shared/agenda/views";
import { nextSevenDays } from "../../../../shared/agenda/windows";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { HomeBlockProps } from "../../home-block";
import type { UnsizedBlock } from "../../home-blocks";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockEmpty } from "./block-empty";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

const CHILD_PREFIX = "child:";

function ChildBlock({ family, clock, blockId, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const agenda = childAgendaView(query.data ?? [], clock, blockId.slice(CHILD_PREFIX.length));
  const days = nextSevenDays.days;
  const allDone = agenda.total > 0;

  return (
    <BlockPanel title={title} icon={ChildIcon}>
      {query.isSuccess && agenda.due.length === 0 && (
        <BlockEmpty
          icon={allDone ? AllDoneIcon : NothingDueIcon}
          title={
            allDone
              ? t("blocks.child.allDone", { days })
              : t("blocks.child.empty", { child: title, days })
          }
          hint={allDone ? t("blocks.child.allDoneHint") : t("blocks.child.emptyHint")}
        />
      )}
      {agenda.due.length > 0 && <EventRows events={agenda.due} family={family} withChild={false} />}
    </BlockPanel>
  );
}

/** One block per child, named after them; a child who leaves the family takes their block along. */
export function childBlock(child: ChildDto, description: string): UnsizedBlock {
  return {
    id: `${CHILD_PREFIX}${child.id}`,
    title: child.label,
    description,
    icon: ChildIcon,
    Component: ChildBlock,
  };
}

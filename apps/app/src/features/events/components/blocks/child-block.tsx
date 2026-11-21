import { AllDoneIcon, ChildIcon, NothingDueIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { childAgendaView } from "../../../../shared/agenda/views";
import { nextSevenDays } from "../../../../shared/agenda/windows";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { useTileSizeClass } from "../../../../shared/dashboard/tile-size-class";
import { blockIsEmpty } from "../../block-emptiness";
import type { HomeBlockProps } from "../../home-block";
import { CHILD_BLOCK_PREFIX } from "../../home-block-bounds";
import type { UnsizedBlock } from "../../home-blocks";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockEmpty } from "./block-empty";
import { BlockGlance } from "./block-glance";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

function ChildBlock({ family, clock, childId, blockId, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const events = query.data ?? [];
  const agenda = childAgendaView(events, clock, blockId.slice(CHILD_BLOCK_PREFIX.length));
  const days = nextSevenDays.days;
  const allDone = agenda.total > 0;
  const glance = useTileSizeClass() === "glance";

  return (
    <BlockPanel title={title} icon={ChildIcon} fits={glance}>
      {query.isSuccess && blockIsEmpty(blockId, { events, clock, childId }) && (
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
      {agenda.due.length > 0 && glance && (
        <BlockGlance
          events={agenda.due}
          label={(count) => t("blocks.child.count", { count })}
          today={clock.today}
        />
      )}
      {agenda.due.length > 0 && !glance && (
        <EventRows events={agenda.due} family={family} withChild={false} />
      )}
    </BlockPanel>
  );
}

/** One block per child, named after them; a child who leaves the family takes their block along. */
export function childBlock(child: ChildDto, description: string): UnsizedBlock {
  return {
    id: `${CHILD_BLOCK_PREFIX}${child.id}`,
    title: child.label,
    description,
    icon: ChildIcon,
    Component: ChildBlock,
  };
}

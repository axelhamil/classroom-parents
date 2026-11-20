import { ChildIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { childAgendaView } from "../../../../shared/agenda/views";
import { nextSevenDays } from "../../../../shared/agenda/windows";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { DashboardBlock } from "../../../../shared/dashboard/dashboard-block";
import type { HomeBlockContext, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

const CHILD_PREFIX = "child:";

function ChildBlock({ family, clock, blockId, title, rows }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const agenda = childAgendaView(query.data ?? [], clock, blockId.slice(CHILD_PREFIX.length));
  const days = nextSevenDays.days;
  const note =
    agenda.total > 0
      ? t("blocks.child.allDone", { days })
      : t("blocks.child.empty", { child: title, days });

  return (
    <BlockPanel
      title={title}
      icon={ChildIcon}
      note={query.isSuccess && agenda.due.length === 0 && note}
    >
      {agenda.due.length > 0 && (
        <EventRows events={agenda.due} family={family} rows={rows} withChild={false} />
      )}
    </BlockPanel>
  );
}

/** One block per child, named after them; a child who leaves the family takes their block along. */
export function childBlock(child: ChildDto, description: string): DashboardBlock<HomeBlockContext> {
  return {
    id: `${CHILD_PREFIX}${child.id}`,
    title: child.label,
    description,
    icon: ChildIcon,
    sizes: { w: [3, 4, 6], h: [1, 2, 3] },
    defaultSize: { w: 4, h: 2 },
    Component: ChildBlock,
  };
}

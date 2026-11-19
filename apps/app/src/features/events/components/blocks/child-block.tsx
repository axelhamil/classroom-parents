import { useQuery } from "@tanstack/react-query";
import { UserRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { DashboardBlock } from "../../../../shared/dashboard/dashboard-block";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockContext, HomeBlockProps } from "../../home-block";
import { weekAhead } from "../../week";
import { BlockPanel } from "./block-panel";
import { EventRows, forChild } from "./event-rows";

const CHILD_PREFIX = "child:";

function ChildBlock({ family, now, blockId, title, rows }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const childId = blockId.slice(CHILD_PREFIX.length);
  const today = schoolToday(now);
  const query = useQuery(calendarEventsQueryOptions(weekAhead(today)));
  const due = forChild(query.data ?? [], childId).filter((event) => !event.done);

  return (
    <BlockPanel
      title={title}
      icon={UserRoundIcon}
      note={query.isSuccess && due.length === 0 && t("blocks.child.empty", { child: title })}
    >
      {due.length > 0 && (
        <EventRows
          events={due}
          family={family}
          now={now}
          today={today}
          rows={rows}
          withChild={false}
        />
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
    icon: UserRoundIcon,
    sizes: { w: [3, 4, 6], h: [1, 2, 3] },
    defaultSize: { w: 4, h: 2 },
    Component: ChildBlock,
  };
}

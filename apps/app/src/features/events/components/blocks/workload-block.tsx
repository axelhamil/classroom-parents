import { daysFrom } from "@packages/ddd-kit/days";
import { DeadlineCategory } from "@packages/ui/components/ui/deadline-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { ChartColumnIcon, ClipboardCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../../shared/api/queries/events";
import { wallDateParts } from "../../../../shared/format/deadline-label";
import { schoolToday } from "../../../../shared/format/school-today";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { WEEK_LENGTH, weekAhead } from "../../week";
import { BlockPanel } from "./block-panel";
import { forChild } from "./event-rows";

interface DayLoad {
  count: number;
  assessments: number;
}

function loadOf(events: readonly EventItem[], childId: string, date: string): DayLoad {
  const due = events.filter((event) => event.childId === childId && event.deadlineDate === date);

  return {
    count: due.length,
    assessments: due.filter((event) => event.category === "assessment").length,
  };
}

function WorkloadBlock({ family, childId, now, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const today = schoolToday(now);
  const days = daysFrom(today, WEEK_LENGTH);
  const query = useQuery(calendarEventsQueryOptions(weekAhead(today)));
  const open = forChild(query.data ?? [], childId).filter((event) => !event.done);
  const children = family.filter((child) => childId === null || child.id === childId);

  return (
    <BlockPanel
      title={title}
      icon={ChartColumnIcon}
      note={query.isSuccess && open.length === 0 && t("blocks.workload.empty")}
    >
      {open.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("blocks.workload.child")}</TableHead>
              {days.map((date) => (
                <TableHead key={date} scope="col">
                  {t("blocks.workload.day", { ...wallDateParts(date) })}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {children.map((child) => (
              <TableRow key={child.id}>
                <TableHead scope="row">{child.label}</TableHead>
                {days.map((date) => {
                  const load = loadOf(open, child.id, date);

                  return (
                    <TableCell key={date}>
                      {load.count}
                      {load.assessments > 0 && (
                        <DeadlineCategory tone="assessment" size="xs">
                          <ClipboardCheckIcon aria-hidden />
                          <span className="sr-only">{t("blocks.workload.assessment")}</span>
                        </DeadlineCategory>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </BlockPanel>
  );
}

export const workloadBlock: HomeBlockDefinition = {
  id: "workload",
  titleKey: "blocks.workload.title",
  descriptionKey: "blocks.workload.description",
  icon: ChartColumnIcon,
  sizes: { w: [6, 8, 12], h: [1, 2] },
  defaultSize: { w: 6, h: 1 },
  Component: WorkloadBlock,
};

import { DeadlineCategory } from "@packages/ui/components/ui/deadline-sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { ChartColumnIcon, ClipboardCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { weekLoadView } from "../../../../shared/agenda/views";
import { nextSevenDays } from "../../../../shared/agenda/windows";
import { wallDateParts } from "../../../../shared/format/deadline-label";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockPanel } from "./block-panel";

function WorkloadBlock({ family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const { days, open, loadOf } = weekLoadView(query.data ?? [], clock, childId);
  const children = family.filter((child) => childId === null || child.id === childId);

  return (
    <BlockPanel
      title={title}
      icon={ChartColumnIcon}
      note={
        query.isSuccess &&
        open.length === 0 &&
        t("blocks.workload.empty", { days: nextSevenDays.days })
      }
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
                  const load = loadOf(child.id, date);

                  return (
                    <TableCell key={date}>
                      {load.count}
                      {load.assessments > 0 && (
                        <DeadlineCategory tone="assessment" size="xs">
                          <ClipboardCheckIcon aria-hidden />
                          <span className="sr-only">
                            {t("blocks.workload.assessment", { count: load.assessments })}
                          </span>
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
  windowDays: nextSevenDays.days,
  icon: ChartColumnIcon,
  Component: WorkloadBlock,
};

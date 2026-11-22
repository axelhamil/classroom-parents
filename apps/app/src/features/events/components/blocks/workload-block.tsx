import { DeadlineCategory } from "@packages/ui/components/ui/deadline-sheet";
import { AssessmentIcon, NothingDueIcon, WorkloadIcon } from "@packages/ui/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@packages/ui/components/ui/table";
import { useTranslation } from "react-i18next";
import { weekLoadView } from "../../../../shared/agenda/views";
import { nextSevenDays } from "../../../../shared/agenda/windows";
import { useTileSizeClass } from "../../../../shared/dashboard/tile-size-class";
import { wallDateParts } from "../../../../shared/format/deadline-label";
import { blockIsEmpty } from "../../block-emptiness";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockEmpty } from "./block-empty";
import { BlockGlance } from "./block-glance";
import { BlockPanel } from "./block-panel";

function WorkloadBlock({ blockId, family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const events = query.data ?? [];
  const { days, open, loadOf } = weekLoadView(events, clock, childId);
  const children = family.filter((child) => childId === null || child.id === childId);
  const glance = useTileSizeClass() === "glance";

  return (
    <BlockPanel title={title} icon={WorkloadIcon} fits={glance}>
      {query.isSuccess && blockIsEmpty(blockId, { events, clock, childId }) && (
        <BlockEmpty
          icon={NothingDueIcon}
          title={t("blocks.workload.empty", { days: nextSevenDays.days })}
          hint={t("blocks.workload.emptyHint")}
        />
      )}
      {open.length > 0 && glance && (
        <BlockGlance
          events={open}
          label={(count) => t("blocks.workload.count", { count, days: nextSevenDays.days })}
          today={clock.today}
        />
      )}
      {open.length > 0 && !glance && (
        <Table fit>
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
                          <AssessmentIcon aria-hidden />
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
  icon: WorkloadIcon,
  Component: WorkloadBlock,
};

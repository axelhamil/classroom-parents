import { ClockAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { lateWindow } from "../../../../shared/agenda/windows";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useLate } from "../../hooks/use-late";
import { OlderLateLink } from "../older-late-link";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

function OverdueBlock({ family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const { t: tEvents } = useTranslation("events");
  const { isSuccess, late, older } = useLate(clock, childId);
  const empty =
    older > 0
      ? t("blocks.overdue.olderOnly", { days: lateWindow.days })
      : t("blocks.overdue.empty");

  return (
    <BlockPanel
      title={title}
      label={late.length > 0 ? tEvents("calendar.overdueCount", { count: late.length }) : undefined}
      count={late.length}
      icon={ClockAlertIcon}
      note={isSuccess && late.length === 0 && empty}
    >
      {(late.length > 0 || older > 0) && (
        <>
          {late.length > 0 && <EventRows events={late} family={family} />}
          <OlderLateLink count={older} />
        </>
      )}
    </BlockPanel>
  );
}

export const overdueBlock: HomeBlockDefinition = {
  id: "overdue",
  titleKey: "blocks.overdue.title",
  descriptionKey: "blocks.overdue.description",
  windowDays: lateWindow.days,
  icon: ClockAlertIcon,
  Component: OverdueBlock,
};

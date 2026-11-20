import { AllDoneIcon, OverdueIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { lateWindow } from "../../../../shared/agenda/windows";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useLate } from "../../hooks/use-late";
import { OlderLateLink } from "../older-late-link";
import { BlockEmpty } from "./block-empty";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

function OverdueBlock({ family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const { t: tEvents } = useTranslation("events");
  const { isSuccess, late, older } = useLate(clock, childId);
  const settledEmpty = isSuccess && late.length === 0;

  return (
    <BlockPanel
      title={title}
      label={late.length > 0 ? tEvents("calendar.overdueCount", { count: late.length }) : undefined}
      count={late.length}
      icon={OverdueIcon}
    >
      {settledEmpty && (
        <BlockEmpty
          icon={AllDoneIcon}
          title={
            older > 0
              ? t("blocks.overdue.olderOnly", { days: lateWindow.days })
              : t("blocks.overdue.empty")
          }
          hint={older > 0 ? <OlderLateLink count={older} /> : t("blocks.overdue.emptyHint")}
        />
      )}
      {late.length > 0 && (
        <>
          <EventRows events={late} family={family} />
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
  icon: OverdueIcon,
  Component: OverdueBlock,
};

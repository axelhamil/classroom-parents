import { AllDoneIcon, OverdueIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import { lateWindow } from "../../../../shared/agenda/windows";
import { useTileFrame } from "../../../../shared/dashboard/tile-frame";
import { blockIsEmpty } from "../../block-emptiness";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useLate } from "../../hooks/use-late";
import { OlderLateLink } from "../older-late-link";
import { BlockEmpty } from "./block-empty";
import { BlockGlance } from "./block-glance";
import { BlockPanel } from "./block-panel";
import { EventRows } from "./event-rows";

function OverdueBlock({ blockId, family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const { t: tEvents } = useTranslation("events");
  const { isSuccess, loaded, late, older } = useLate(clock, childId);
  const settledEmpty = isSuccess && blockIsEmpty(blockId, { events: loaded, clock, childId });
  const glance = useTileFrame().size === "s";

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
      {late.length > 0 && glance && (
        <BlockGlance
          events={late}
          label={(count) => t("blocks.overdue.count", { count })}
          today={clock.today}
        />
      )}
      {late.length > 0 && !glance && (
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

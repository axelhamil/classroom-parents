import { AllDoneIcon, NothingDueIcon } from "@packages/ui/components/ui/icons";
import { Progress } from "@packages/ui/components/ui/progress";
import { useTranslation } from "react-i18next";
import { progressView } from "../../../../shared/agenda/views";
import { blockIsEmpty } from "../../block-emptiness";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockEmpty } from "./block-empty";
import { BlockPanel } from "./block-panel";

function ProgressBlock({ blockId, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const query = useHomeEvents(clock);
  const events = query.data ?? [];
  const { done, total } = progressView(events, clock, childId);
  const counts = { count: done, total };
  const summary =
    total > 0 && done === total
      ? t("blocks.progress.allDone")
      : t("blocks.progress.summary", counts);

  return (
    <BlockPanel title={title} icon={AllDoneIcon} note={query.isSuccess && total > 0 && summary}>
      {query.isSuccess && blockIsEmpty(blockId, { events, clock, childId }) && (
        <BlockEmpty
          icon={NothingDueIcon}
          title={t("blocks.progress.empty")}
          hint={t("blocks.progress.emptyHint")}
        />
      )}
      {total > 0 && (
        <Progress
          value={done}
          max={total}
          tone={done === total ? "success" : "ink"}
          aria-label={t("blocks.progress.label", counts)}
        />
      )}
    </BlockPanel>
  );
}

export const progressBlock: HomeBlockDefinition = {
  id: "progress",
  titleKey: "blocks.progress.title",
  descriptionKey: "blocks.progress.description",
  icon: AllDoneIcon,
  Component: ProgressBlock,
};

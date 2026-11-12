import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { childLabelOf } from "../../../shared/format/child-hue";
import { dayLabel } from "../../../shared/format/deadline-label";
import type { WeekDay } from "../week";
import { ShareButton } from "./share-button";

export interface WeekShareButtonProps {
  days: readonly WeekDay[];
  family: readonly ChildDto[];
  now: Date;
}

export function WeekShareButton({ days, family, now }: WeekShareButtonProps) {
  const { t } = useTranslation("events");

  const payload = () => {
    const title = t("week.shareTitle");
    const planned = days.filter((day) => day.events.length > 0);
    const body =
      planned.length === 0
        ? t("week.shareNothing")
        : planned
            .map((day) =>
              [
                t("week.shareDay", { day: dayLabel(day.date, now) }),
                ...day.events.map((event) =>
                  t("week.shareItem", {
                    child: childLabelOf(family, event.childId),
                    title: event.title,
                  }),
                ),
              ].join("\n"),
            )
            .join("\n\n");

    return { title, text: `${title}\n\n${body}` };
  };

  return <ShareButton label={t("week.share")} payload={payload} />;
}

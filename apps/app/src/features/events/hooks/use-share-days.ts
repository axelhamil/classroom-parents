import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { childLabelOf } from "../../../shared/format/child-hue";
import { dayLabel } from "../../../shared/format/deadline-label";
import type { CalendarDay } from "../calendar";
import { useShare } from "../components/share-button";

export function useShareDays(family: readonly ChildDto[], now: Date) {
  const { t } = useTranslation("events");
  const { share } = useShare();

  return (days: readonly CalendarDay[]) => {
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

    void share({ title, text: `${title}\n\n${body}` });
  };
}

import { useTranslation } from "react-i18next";
import type { AgendaSummary } from "../../../../shared/agenda/calendar-days";

/** "2 échéances, dont 1 évaluation": how a period or a day says what it holds. */
export function useSummaryLabel(): (summary: AgendaSummary) => string {
  const { t } = useTranslation("events");

  return ({ count, assessments }) => {
    if (assessments === 0) return t("calendar.summary", { count });
    if (count === 1) return t("calendar.summaryOnlyAssessment");

    return t("calendar.summaryAssessments", { count: assessments, total: count });
  };
}

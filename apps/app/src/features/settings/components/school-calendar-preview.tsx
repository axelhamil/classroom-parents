import { Button } from "@packages/ui/components/ui/button";
import {
  DescriptionDetails,
  DescriptionItem,
  DescriptionList,
  DescriptionTerm,
} from "@packages/ui/components/ui/description-list";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { TypographyList, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { dayLabel } from "../../../shared/format/deadline-label";
import { QueryState } from "../../../shared/query/query-state";
import { schoolCalendarPreviewQueryOptions } from "../api/school-calendar.queries";

export interface SchoolCalendarPreviewProps {
  country: string;
  region: string | null;
  showsHolidays: boolean;
  onUseOwn: () => void;
}

/** The next three holidays and the next bank holiday of a calendar, before the parent saves it. */
export function SchoolCalendarPreview({
  country,
  region,
  showsHolidays,
  onUseOwn,
}: SchoolCalendarPreviewProps) {
  const { t } = useTranslation("settings");
  const query = useQuery(schoolCalendarPreviewQueryOptions(country, region));
  const { today } = useSchoolClock();

  return (
    <QueryState
      query={query}
      skeleton={
        <SkeletonGroup label={t("schoolHolidays.previewLoading")}>
          <Skeleton className="h-16 w-full" />
        </SkeletonGroup>
      }
    >
      {({ holidays, bankHoliday, schoolHolidaysCovered }) => (
        <DescriptionList aria-label={t("schoolHolidays.preview")}>
          {showsHolidays && (
            <DescriptionItem>
              <DescriptionTerm>{t("schoolHolidays.previewHolidays")}</DescriptionTerm>
              <DescriptionDetails>
                {holidays.length > 0 ? (
                  <TypographyList>
                    {holidays.map(({ name, startsOn, endsOn }) => (
                      <li key={`${name}-${startsOn}`}>
                        {t("schoolHolidays.period", {
                          name,
                          from: dayLabel(startsOn, today),
                          to: dayLabel(endsOn, today),
                        })}
                      </li>
                    ))}
                  </TypographyList>
                ) : (
                  t("schoolHolidays.previewNone")
                )}
                {!schoolHolidaysCovered && (
                  <>
                    <TypographyMuted>{t("schoolHolidays.previewNotPublished")}</TypographyMuted>
                    <Button type="button" size="sm" variant="outline" onClick={onUseOwn}>
                      {t("schoolHolidays.useOwn")}
                    </Button>
                  </>
                )}
              </DescriptionDetails>
            </DescriptionItem>
          )}
          <DescriptionItem>
            <DescriptionTerm>{t("schoolHolidays.previewBankHoliday")}</DescriptionTerm>
            <DescriptionDetails>
              {bankHoliday
                ? t("schoolHolidays.day", {
                    name: bankHoliday.name,
                    date: dayLabel(bankHoliday.date, today),
                  })
                : t("schoolHolidays.previewNone")}
            </DescriptionDetails>
          </DescriptionItem>
        </DescriptionList>
      )}
    </QueryState>
  );
}

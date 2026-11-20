import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SCHOOL_CALENDAR_KEY } from "../../../shared/api/queries/school-calendar";
import { setSchoolCalendarMutationOptions } from "../api/school-calendar.mutations";
import { schoolCalendarSettingsQueryOptions } from "../api/school-calendar.queries";
import { choiceFor, coverageOf } from "../school-calendar";

/**
 * The country is asked once: when the parent moves it, a school calendar already chosen moves
 * with it, to the whole new country, or goes away where no calendar is published.
 */
export function useCalendarFollowsCountry(userId: string): (country: string) => void {
  const queryClient = useQueryClient();
  const { queryKey } = schoolCalendarSettingsQueryOptions(userId);
  const follow = useMutation({
    ...setSchoolCalendarMutationOptions,
    onSettled: () => queryClient.invalidateQueries({ queryKey: SCHOOL_CALENDAR_KEY }),
    onError: (error) => toastError(error, errorFallback("setSchoolCalendar")),
  });

  return (country) => {
    const settings = queryClient.getQueryData(queryKey);
    const choice = settings?.choice;
    if (!settings || !choice || choice.country === country) return;

    const coverage = coverageOf(settings, country);
    follow.mutate(coverage ? choiceFor(coverage) : null);
  };
}

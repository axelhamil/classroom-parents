import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SCHOOL_CALENDAR_KEY } from "../../../shared/api/queries/school-calendar";
import { QueryState } from "../../../shared/query/query-state";
import {
  type SchoolCalendarChoice,
  setSchoolCalendarMutationOptions,
} from "../api/school-calendar.mutations";
import { schoolCalendarSettingsQueryOptions } from "../api/school-calendar.queries";
import { SchoolCalendarForm } from "../forms/school-calendar-form";
import { OwnHolidays } from "./own-holidays";

export interface SchoolHolidaysCardProps {
  userId: string;
}

export function SchoolHolidaysCard({ userId }: SchoolHolidaysCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = useQuery(schoolCalendarSettingsQueryOptions(userId));
  const save = useMutation({
    ...setSchoolCalendarMutationOptions,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SCHOOL_CALENDAR_KEY });
      toastSuccess(t("schoolHolidays.saved"));
    },
    onError: (error) => toastError(error, errorFallback("setSchoolCalendar")),
  });

  const saveChoice = (choice: SchoolCalendarChoice) =>
    save.mutateAsync(choice).then(
      () => true,
      () => false,
    );

  return (
    <SectionCard title={t("schoolHolidays.title")} description={t("schoolHolidays.description")}>
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("schoolHolidays.loading")}>
            <Skeleton className="h-24 w-full" />
          </SkeletonGroup>
        }
      >
        {(settings) => (
          <SchoolCalendarForm
            settings={settings}
            pending={save.isPending}
            onSubmit={saveChoice}
            ownHolidays={(beforeEdit) => (
              <OwnHolidays periods={settings.periods} beforeEdit={beforeEdit} />
            )}
          />
        )}
      </QueryState>
    </SectionCard>
  );
}

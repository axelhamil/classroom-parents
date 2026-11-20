import { IconButton } from "@packages/ui/components/ui/icon-button";
import { DeleteIcon } from "@packages/ui/components/ui/icons";
import { Input } from "@packages/ui/components/ui/input";
import { Label } from "@packages/ui/components/ui/label";
import { ListRow, ListRowAction, ListRowContent } from "@packages/ui/components/ui/list-row";
import { TypographyH4, TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { SCHOOL_CALENDAR_KEY } from "../../../shared/api/queries/school-calendar";
import { dayLabel } from "../../../shared/format/deadline-label";
import {
  type IcsImport,
  importSchoolHolidaysMutationOptions,
  removeSchoolHolidayMutationOptions,
} from "../api/school-calendar.mutations";
import type { SchoolCalendarSettings } from "../api/school-calendar.queries";
import { AddHolidayPeriodForm } from "../forms/add-holiday-period-form";
import { ImportIcsLinkForm } from "../forms/import-ics-link-form";

type HolidayPeriod = SchoolCalendarSettings["periods"][number];

export interface OwnHolidaysProps {
  periods: readonly HolidayPeriod[];
}

/** The school's own holidays: imported from its iCalendar link or file, or typed one by one. */
export function OwnHolidays({ periods }: OwnHolidaysProps) {
  const { t } = useTranslation("settings");
  const { today } = useSchoolClock();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: SCHOOL_CALENDAR_KEY });

  const importer = useMutation({
    ...importSchoolHolidaysMutationOptions,
    onSuccess: ({ imported }) => {
      void refresh();
      toastSuccess(t("schoolHolidays.own.imported", { count: imported }));
    },
    onError: (error) => toastError(error, errorFallback("importSchoolHolidays")),
  });
  const remover = useMutation({
    ...removeSchoolHolidayMutationOptions,
    onSuccess: () => {
      void refresh();
      toastSuccess(t("schoolHolidays.own.removed"));
    },
    onError: (error) => toastError(error, errorFallback("removeSchoolHoliday")),
  });

  const importFrom = (source: IcsImport) => importer.mutate(source);

  const importFile = async (file: File | undefined) => {
    if (file) importFrom({ content: await file.text() });
  };

  return (
    <section aria-labelledby="own-holidays-title" className="flex flex-col gap-4">
      <TypographyH4 id="own-holidays-title">{t("schoolHolidays.own.title")}</TypographyH4>
      <ImportIcsLinkForm pending={importer.isPending} onImport={(url) => importFrom({ url })} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="own-holidays-file">{t("schoolHolidays.own.importFile")}</Label>
        <Input
          id="own-holidays-file"
          type="file"
          accept=".ics,text/calendar"
          disabled={importer.isPending}
          onChange={(event) => void importFile(event.target.files?.[0])}
        />
        <TypographyMuted>{t("schoolHolidays.own.importFileHint")}</TypographyMuted>
      </div>
      <AddHolidayPeriodForm onAdded={refresh} />
      {periods.length === 0 ? (
        <TypographyMuted>{t("schoolHolidays.own.empty")}</TypographyMuted>
      ) : (
        <ul className="flex flex-col">
          {periods.map((period) => (
            <ListRow key={period.id}>
              <ListRowContent>
                {t("schoolHolidays.period", {
                  name: period.name,
                  from: dayLabel(period.startsOn, today),
                  to: dayLabel(period.endsOn, today),
                })}
                <TypographyMuted>{t(`schoolHolidays.own.origin.${period.origin}`)}</TypographyMuted>
              </ListRowContent>
              <ListRowAction>
                <IconButton
                  variant="ghost"
                  size="icon-sm"
                  label={t("schoolHolidays.own.remove", { name: period.name })}
                  disabled={remover.isPending}
                  onClick={() => remover.mutate(period.id)}
                >
                  <DeleteIcon aria-hidden />
                </IconButton>
              </ListRowAction>
            </ListRow>
          ))}
        </ul>
      )}
    </section>
  );
}

import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  addSchoolHolidayMutationOptions,
  type HolidayPeriodDraft,
} from "../api/school-calendar.mutations";

const EMPTY_PERIOD: HolidayPeriodDraft = { name: "", startsOn: "", endsOn: "" };

export interface AddHolidayPeriodFormProps {
  onAdded: () => void;
}

/** One school holiday typed by hand, from its first to its last day off. */
export function AddHolidayPeriodForm({ onAdded }: AddHolidayPeriodFormProps) {
  const { t } = useTranslation("settings");
  const form = useForm<HolidayPeriodDraft>({ defaultValues: EMPTY_PERIOD });
  const add = useMutation({
    ...addSchoolHolidayMutationOptions,
    onSuccess: () => {
      form.reset(EMPTY_PERIOD);
      onAdded();
      toastSuccess(t("schoolHolidays.own.added"));
    },
    onError: (error) => toastError(error, errorFallback("addSchoolHoliday")),
  });

  const submit = (period: HolidayPeriodDraft) => add.mutate(period);

  return (
    <Form {...form}>
      <form
        aria-label={t("schoolHolidays.own.add")}
        onSubmit={form.handleSubmit(submit)}
        className="flex flex-col gap-2"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="name"
          label={t("schoolHolidays.own.name")}
          placeholder={t("schoolHolidays.own.namePlaceholder")}
          maxLength={120}
        />
        <div className="grid grid-cols-2 gap-2">
          <FormTextField
            control={form.control}
            name="startsOn"
            type="date"
            label={t("schoolHolidays.own.startsOn")}
          />
          <FormTextField
            control={form.control}
            name="endsOn"
            type="date"
            label={t("schoolHolidays.own.endsOn")}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={add.isPending}
        >
          {t("schoolHolidays.own.addAction")}
        </Button>
      </form>
    </Form>
  );
}

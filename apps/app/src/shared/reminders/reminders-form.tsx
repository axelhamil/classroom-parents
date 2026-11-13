import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { Hint } from "@packages/ui/components/ui/hint";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { ListRow } from "@packages/ui/components/ui/list-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Plus, Trash2 } from "lucide-react";
import { type Control, useFieldArray, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
  NEW_REMINDER_ROW,
  REMINDER_KINDS,
  REMINDERS_MAX,
  type Reminder,
  type ReminderKind,
  type ReminderRefusal,
  type RemindersInput,
  remindersSchema,
  sameReminder,
  toReminderRows,
  toReminders,
} from "./reminders.schema";

const KIND_LABEL_KEYS = {
  days_before: "reminders.kinds.days_before",
  hours_before: "reminders.kinds.hours_before",
} as const;

export interface RemindersFormProps {
  reminders: Reminder[];
  allowHours: boolean;
  pending: boolean;
  onSubmit: (reminders: Reminder[], refuse: (refusal: ReminderRefusal) => void) => void;
  onCancel?: () => void;
  formId?: string;
}

export function RemindersForm({
  reminders,
  allowHours,
  pending,
  onSubmit,
  onCancel,
  formId,
}: RemindersFormProps) {
  const { t } = useTranslation("common");
  const form = useForm<RemindersInput>({
    resolver: zodResolver(remindersSchema),
    defaultValues: toReminderRows(reminders),
  });
  const rows = useFieldArray({ control: form.control, name: "reminders" });
  const full = rows.fields.length >= REMINDERS_MAX;
  const refuse = ({ reminder, message }: ReminderRefusal) =>
    form.getValues("reminders").forEach((row, index) => {
      if (!sameReminder(row, reminder)) return;

      const field = row.kind === "hours_before" ? "hours" : "days";
      form.setError(`reminders.${index}.${field}`, { message }, { shouldFocus: true });
    });

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit((values) => onSubmit(toReminders(values), refuse))}
        className="flex flex-col gap-4"
        noValidate
      >
        {rows.fields.length === 0 ? (
          <TypographyMuted>{t("reminders.empty")}</TypographyMuted>
        ) : (
          <ol className="flex flex-col gap-2">
            {rows.fields.map((row, index) => (
              <ListRow key={row.id} className="items-end">
                <ReminderFields control={form.control} index={index} allowHours={allowHours} />
                <IconButton
                  type="button"
                  variant="ghost"
                  label={t("reminders.remove", { number: index + 1 })}
                  onClick={() => rows.remove(index)}
                >
                  <Trash2 />
                </IconButton>
              </ListRow>
            ))}
          </ol>
        )}
        {allowHours ? null : <TypographyMuted>{t("reminders.hoursNeedTime")}</TypographyMuted>}
        <Hint text={full ? t("reminders.full") : undefined} className="self-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => rows.append(NEW_REMINDER_ROW)}
          >
            <Plus />
            {t("reminders.add")}
          </Button>
        </Hint>
        {formId ? null : (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {t("actions.save")}
            </Button>
            {onCancel ? (
              <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                {t("actions.cancel")}
              </Button>
            ) : null}
          </div>
        )}
      </form>
    </Form>
  );
}

interface ReminderFieldsProps {
  control: Control<RemindersInput>;
  index: number;
  allowHours: boolean;
}

function ReminderFields({ control, index, allowHours }: ReminderFieldsProps) {
  const { t } = useTranslation("common");
  const kind = useWatch({ control, name: `reminders.${index}.kind` });
  const kinds: readonly ReminderKind[] =
    allowHours || kind === "hours_before" ? REMINDER_KINDS : ["days_before"];

  return (
    <fieldset className="flex min-w-0 flex-wrap items-start gap-4">
      <legend className="sr-only">{t("reminders.item", { number: index + 1 })}</legend>
      <FormField
        control={control}
        name={`reminders.${index}.kind`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("reminders.kind")}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {kinds.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(KIND_LABEL_KEYS[option])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      {kind === "hours_before" ? (
        <FormTextField
          control={control}
          name={`reminders.${index}.hours`}
          type="number"
          inputMode="numeric"
          label={t("reminders.hours")}
        />
      ) : (
        <>
          <FormTextField
            control={control}
            name={`reminders.${index}.days`}
            type="number"
            inputMode="numeric"
            label={t("reminders.days")}
          />
          <FormTextField
            control={control}
            name={`reminders.${index}.time`}
            type="time"
            label={t("reminders.time")}
          />
        </>
      )}
    </fieldset>
  );
}

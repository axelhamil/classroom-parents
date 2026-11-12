import { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { Textarea } from "@packages/ui/components/ui/textarea";
import type { Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { CATEGORY_LABEL_KEYS } from "../../../shared/events/event-labels";
import { DeadlineDatePicker } from "../components/deadline-date-picker";
import type { EventEditInput } from "../events.schema";

export type EventFieldNote = "title" | "description" | "category" | "deadline";

export interface EventFieldsProps {
  control: Control<EventEditInput>;
  note?: (field: EventFieldNote) => string | undefined;
}

export function eventFieldOf(
  code: string | undefined,
  dateChanged: boolean,
): keyof EventEditInput | null {
  switch (code) {
    case "EVENT_TITLE_INVALID":
      return "title";
    case "EVENT_DESCRIPTION_INVALID":
      return "description";
    case "EVENT_CATEGORY_INVALID":
      return "category";
    case "EVENT_DEADLINE_INVALID":
      return dateChanged ? "deadlineDate" : "deadlineTime";
    default:
      return null;
  }
}

function noNote(): undefined {
  return undefined;
}

export function EventFields({ control, note = noNote }: EventFieldsProps) {
  const { t } = useTranslation("eventEdit");
  const { t: tEvents } = useTranslation("events");

  return (
    <>
      <FormTextField
        control={control}
        name="title"
        label={t("fields.title")}
        description={note("title")}
      />
      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("fields.description")}</FormLabel>
            <FormControl>
              <Textarea {...field} />
            </FormControl>
            {note("description") && <FormDescription>{note("description")}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="category"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("fields.category")}</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {EVENT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {tEvents(CATEGORY_LABEL_KEYS[category])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {note("category") && <FormDescription>{note("category")}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="flex flex-wrap gap-4">
        <FormField
          control={control}
          name="deadlineDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fields.deadlineDate")}</FormLabel>
              <DeadlineDatePicker value={field.value} onChange={field.onChange} />
              {note("deadline") && <FormDescription>{note("deadline")}</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormTextField
          control={control}
          name="deadlineTime"
          type="time"
          label={t("fields.deadlineTime")}
          description={note("deadline")}
        />
      </div>
    </>
  );
}

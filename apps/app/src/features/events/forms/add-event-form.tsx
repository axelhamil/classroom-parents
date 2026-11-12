import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { Form } from "@packages/ui/components/ui/form";
import { Label } from "@packages/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { childHue } from "../../../shared/format/child-hue";
import { addEventMutationOptions, type NewEvent } from "../api/events.mutations";
import { type EventEditInput, eventEditSchema } from "../events.schema";
import { EventFields, eventFieldOf } from "./event-fields";

function newEventOf(childId: string, values: EventEditInput): NewEvent {
  return {
    childId,
    title: values.title,
    category: values.category,
    deadlineDate: values.deadlineDate,
    ...(values.description ? { description: values.description } : {}),
    ...(values.deadlineTime ? { deadlineTime: values.deadlineTime } : {}),
  };
}

export interface AddEventFormProps {
  family: readonly ChildDto[];
  childId: string;
  date: string;
  onAdded: () => void;
}

export function AddEventForm({ family, childId, date, onAdded }: AddEventFormProps) {
  const { t } = useTranslation("events");
  const { t: tErrors } = useTranslation("errors");
  const queryClient = useQueryClient();
  const childFieldId = useId();
  const [child, setChild] = useState(childId);
  const form = useForm<EventEditInput>({
    resolver: zodResolver(eventEditSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "other",
      deadlineDate: date,
      deadlineTime: "",
    },
  });
  const mutation = useMutation({
    ...addEventMutationOptions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
      toastSuccess(t("calendar.addDialog.added"));
      onAdded();
    },
    onError: (error) => {
      const field = eventFieldOf(apiErrorFields(error).code, true);
      if (!field) return toastError(error, errorFallback("addEvent"));

      form.setError(field, { message: formatApiError(error, errorFallback("addEvent"), tErrors) });
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(newEventOf(child, values)))}
        className="flex flex-col gap-4"
        noValidate
      >
        {family.length > 1 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={childFieldId}>{t("calendar.addDialog.child")}</Label>
            <Select value={child} onValueChange={setChild}>
              <SelectTrigger id={childFieldId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {family.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    <ChildAvatar name={member.label} tone={childHue(family, member.id)} size="xs" />
                    {member.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <EventFields control={form.control} />
        <Button type="submit" disabled={mutation.isPending} className="self-start">
          {t("calendar.addDialog.submit")}
        </Button>
      </form>
    </Form>
  );
}

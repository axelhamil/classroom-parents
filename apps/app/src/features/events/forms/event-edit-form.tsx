import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@packages/ui/components/ui/alert-dialog";
import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
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
import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useRef } from "react";
import { type FieldNamesMarkedBoolean, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { CATEGORY_LABEL_KEYS, EVENT_CATEGORIES } from "../../../shared/events/event-labels";
import { type EventPatch, editEventMutationOptions } from "../api/events.mutations";
import { DeleteEventDialog } from "../components/delete-event-dialog";
import { type EventEditInput, eventEditSchema } from "../events.schema";

const CLEAR_TIME = "clear";

function valuesOf(event: EventItem): EventEditInput {
  return {
    title: event.title,
    description: event.description,
    category: event.category,
    deadlineDate: event.deadlineDate,
    deadlineTime: event.deadlineTime ?? "",
  };
}

function patchOf(
  values: EventEditInput,
  dirty: Partial<Readonly<FieldNamesMarkedBoolean<EventEditInput>>>,
): EventPatch {
  return {
    ...(dirty.title ? { title: values.title } : {}),
    ...(dirty.description ? { description: values.description } : {}),
    ...(dirty.category ? { category: values.category } : {}),
    ...(dirty.deadlineDate ? { deadlineDate: values.deadlineDate } : {}),
    ...(dirty.deadlineTime ? { deadlineTime: values.deadlineTime || CLEAR_TIME } : {}),
  };
}

function fieldOf(
  code: string | undefined,
  dirty: Partial<Readonly<FieldNamesMarkedBoolean<EventEditInput>>>,
): keyof EventEditInput | null {
  switch (code) {
    case "EVENT_TITLE_INVALID":
      return "title";
    case "EVENT_DESCRIPTION_INVALID":
      return "description";
    case "EVENT_CATEGORY_INVALID":
      return "category";
    case "EVENT_DEADLINE_INVALID":
      return dirty.deadlineDate ? "deadlineDate" : "deadlineTime";
    default:
      return null;
  }
}

export interface EventEditFormProps {
  event: EventItem;
  onSaved: (event: EventItem) => void;
  onCancel: () => void;
  onDeleted: () => void;
}

export function EventEditForm({ event, onSaved, onCancel, onDeleted }: EventEditFormProps) {
  const { t } = useTranslation("eventEdit");
  const { t: tEvents } = useTranslation("events");
  const { t: tErrors } = useTranslation("errors");
  const form = useForm<EventEditInput>({
    resolver: zodResolver(eventEditSchema),
    defaultValues: valuesOf(event),
  });
  const { isDirty, dirtyFields } = form.formState;
  const frozenNote = (field: EventItem["editedFields"][number]) =>
    event.editedFields.includes(field) ? t("editedByYou") : undefined;
  const released = useRef(false);
  const leave = (next: () => void) => {
    released.current = true;
    next();
  };
  const mutation = useMutation({
    ...editEventMutationOptions,
    onSuccess: (saved) => leave(() => onSaved(saved)),
    onError: (error) => {
      const field = fieldOf(apiErrorFields(error).code, form.formState.dirtyFields);
      if (!field) return toastError(error, errorFallback("editEvent"));

      form.setError(field, { message: formatApiError(error, errorFallback("editEvent"), tErrors) });
    },
  });
  const hasUnsavedChanges = () => !released.current && form.formState.isDirty;
  const blocker = useBlocker({
    shouldBlockFn: hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate({ eventId: event.id, patch: patchOf(values, dirtyFields) }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="title"
          label={t("fields.title")}
          description={frozenNote("title")}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("fields.description")}</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              {frozenNote("description") && (
                <FormDescription>{frozenNote("description")}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
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
              {frozenNote("category") && (
                <FormDescription>{frozenNote("category")}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-4">
          <FormTextField
            control={form.control}
            name="deadlineDate"
            type="date"
            label={t("fields.deadlineDate")}
            description={frozenNote("deadline")}
          />
          <FormTextField
            control={form.control}
            name="deadlineTime"
            type="time"
            label={t("fields.deadlineTime")}
            description={frozenNote("deadline")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!isDirty || mutation.isPending}>
            {t("save")}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <DeleteEventDialog
            eventId={event.id}
            eventTitle={event.title}
            onDeleted={() => leave(onDeleted)}
          />
        </div>
      </form>
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leave.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("leave.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("leave.stay")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={blocker.proceed}>
              {t("leave.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}

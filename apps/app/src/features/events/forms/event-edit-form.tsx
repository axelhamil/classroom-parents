import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { DestructiveActionDialog } from "@packages/ui/components/ui/destructive-action-dialog";
import { Form } from "@packages/ui/components/ui/form";
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
import { type EventPatch, editEventMutationOptions } from "../api/events.mutations";
import { DeleteEventDialog } from "../components/delete-event-dialog";
import { type EventEditInput, eventEditSchema } from "../events.schema";
import { type EventFieldNote, EventFields, eventFieldOf } from "./event-fields";

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

export interface EventEditFormProps {
  event: EventItem;
  onSaved: (event: EventItem) => void;
  onCancel: () => void;
  onDeleted: () => void;
}

export function EventEditForm({ event, onSaved, onCancel, onDeleted }: EventEditFormProps) {
  const { t } = useTranslation("eventEdit");
  const { t: tErrors } = useTranslation("errors");
  const form = useForm<EventEditInput>({
    resolver: zodResolver(eventEditSchema),
    defaultValues: valuesOf(event),
  });
  const { isDirty, dirtyFields } = form.formState;
  const frozenNote = (field: EventFieldNote) =>
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
      const field = eventFieldOf(
        apiErrorFields(error).code,
        form.formState.dirtyFields.deadlineDate === true,
      );
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
        <EventFields control={form.control} note={frozenNote} />
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
      <DestructiveActionDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title={t("leave.title")}
        description={t("leave.description")}
        actionLabel={t("leave.confirm")}
        cancelLabel={t("leave.stay")}
        onConfirm={() => blocker.proceed?.()}
      />
    </Form>
  );
}

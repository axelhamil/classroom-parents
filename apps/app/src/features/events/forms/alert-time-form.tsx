import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { setEventAlertMutationOptions } from "../api/events.mutations";
import { eventAlertQueryOptions } from "../api/events.queries";
import { type AlertTimeInput, alertTimeSchema } from "../events.schema";

export interface AlertTimeFormProps {
  eventId: string;
  defaultValues: AlertTimeInput;
  onClose: () => void;
}

export function AlertTimeForm({ eventId, defaultValues, onClose }: AlertTimeFormProps) {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const form = useForm<AlertTimeInput>({
    resolver: zodResolver(alertTimeSchema),
    defaultValues,
  });
  const mutation = useMutation({
    ...setEventAlertMutationOptions,
    onSuccess: (alert) => {
      queryClient.setQueryData(eventAlertQueryOptions(eventId).queryKey, alert);
      toastSuccess(t("alert.saved"));
      onClose();
    },
    onError: (error) => toastError(error, errorFallback("setEventAlert")),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((time) => mutation.mutate({ eventId, time }))}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-wrap gap-4">
          <FormTextField control={form.control} name="date" type="date" label={t("alert.date")} />
          <FormTextField control={form.control} name="time" type="time" label={t("alert.time")} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={mutation.isPending}>
            {t("alert.save")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t("alert.cancel")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

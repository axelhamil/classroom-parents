import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormCheckboxField } from "@packages/ui/components/ui/form-checkbox-field";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
  type QuietHours,
  setQuietHoursMutationOptions,
} from "../../../shared/api/mutations/set-quiet-hours";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { quietHoursQueryOptions } from "../../../shared/api/queries/quiet-hours";
import { QueryState } from "../../../shared/query/query-state";

const quietHoursSchema = z
  .object({
    enabled: z.boolean(),
    start: z.iso.time({ precision: -1 }),
    end: z.iso.time({ precision: -1 }),
  })
  .refine(({ start, end }) => start !== end, {
    path: ["end"],
    params: { i18nKey: "validation.quietHoursSame" },
  });

export interface QuietHoursCardProps {
  userId: string;
}

export function QuietHoursCard({ userId }: QuietHoursCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = useQuery(quietHoursQueryOptions(userId));
  const save = useMutation({
    ...setQuietHoursMutationOptions,
    onSuccess: (quiet) => {
      queryClient.setQueryData(quietHoursQueryOptions(userId).queryKey, quiet);
      void queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
      toastSuccess(t("quietHours.saved"));
    },
    onError: (error) => toastError(error, errorFallback("setQuietHours")),
  });

  return (
    <SectionCard title={t("quietHours.title")} description={t("quietHours.description")}>
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("quietHours.loading")}>
            <Skeleton className="h-24 w-full" />
          </SkeletonGroup>
        }
      >
        {(quiet) => (
          <QuietHoursForm
            key={JSON.stringify(quiet)}
            quiet={quiet}
            pending={save.isPending}
            onSubmit={(next) => save.mutate(next)}
          />
        )}
      </QueryState>
    </SectionCard>
  );
}

interface QuietHoursFormProps {
  quiet: QuietHours;
  pending: boolean;
  onSubmit: (quiet: QuietHours) => void;
}

function QuietHoursForm({ quiet, pending, onSubmit }: QuietHoursFormProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const form = useForm<QuietHours>({
    resolver: zodResolver(quietHoursSchema),
    defaultValues: quiet,
  });
  const enabled = useWatch({ control: form.control, name: "enabled" });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormCheckboxField control={form.control} name="enabled" label={t("quietHours.enabled")} />
        <div className="grid grid-cols-2 gap-3">
          <FormTextField
            control={form.control}
            name="start"
            type="time"
            label={t("quietHours.start")}
            disabled={!enabled}
          />
          <FormTextField
            control={form.control}
            name="end"
            type="time"
            label={t("quietHours.end")}
            disabled={!enabled}
          />
        </div>
        <Button type="submit" size="sm" className="self-start" disabled={pending}>
          {tCommon("actions.save")}
        </Button>
      </form>
    </Form>
  );
}

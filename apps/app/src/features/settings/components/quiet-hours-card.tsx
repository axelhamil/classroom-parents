import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { SwitchField } from "@packages/ui/components/ui/switch-field";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { setQuietHoursMutationOptions } from "../../../shared/api/mutations/set-quiet-hours";
import { EVENTS_KEY } from "../../../shared/api/queries/events";
import { quietHoursQueryOptions } from "../../../shared/api/queries/quiet-hours";
import { QueryState } from "../../../shared/query/query-state";

const quietTimesSchema = z
  .object({
    start: z.iso.time({ precision: -1 }),
    end: z.iso.time({ precision: -1 }),
  })
  .refine(({ start, end }) => start !== end, {
    path: ["end"],
    params: { i18nKey: "validation.quietHoursSame" },
  });

type QuietTimes = z.infer<typeof quietTimesSchema>;

/** Mirrors DEFAULT_QUIET_HOURS in modules/alerts quiet-hours.vo.ts, which the api does not expose: change both together. */
const SERVER_DEFAULT_QUIET_TIMES: QuietTimes = { start: "21:00", end: "07:00" };

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
        {(stored) => {
          const quiet = save.isPending ? save.variables : stored;

          return (
            <>
              <SwitchField
                label={t("quietHours.enabled")}
                description={quiet.enabled ? t("quietHours.on") : t("quietHours.off")}
                checked={quiet.enabled}
                disabled={save.isPending}
                onCheckedChange={(enabled) =>
                  save.mutate(
                    enabled ? { enabled, ...SERVER_DEFAULT_QUIET_TIMES } : { ...stored, enabled },
                  )
                }
              />
              {stored.enabled ? (
                <QuietTimesForm
                  key={JSON.stringify(stored)}
                  times={stored}
                  pending={save.isPending}
                  onSubmit={(times) => save.mutate({ enabled: true, ...times })}
                />
              ) : null}
            </>
          );
        }}
      </QueryState>
    </SectionCard>
  );
}

interface QuietTimesFormProps {
  times: QuietTimes;
  pending: boolean;
  onSubmit: (times: QuietTimes) => void;
}

function QuietTimesForm({ times, pending, onSubmit }: QuietTimesFormProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const form = useForm<QuietTimes>({
    resolver: zodResolver(quietTimesSchema),
    defaultValues: { start: times.start, end: times.end },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <FormTextField
            control={form.control}
            name="start"
            type="time"
            label={t("quietHours.start")}
          />
          <FormTextField
            control={form.control}
            name="end"
            type="time"
            label={t("quietHours.end")}
          />
        </div>
        <Button type="submit" size="sm" className="self-start" disabled={pending}>
          {tCommon("actions.save")}
        </Button>
      </form>
    </Form>
  );
}

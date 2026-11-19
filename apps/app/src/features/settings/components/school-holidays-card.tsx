import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@packages/ui/components/ui/form";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SCHOOL_CALENDAR_KEY } from "../../../shared/api/queries/school-calendar";
import { QueryState } from "../../../shared/query/query-state";
import { type SchoolZoneChoice, setSchoolZoneMutationOptions } from "../api/settings.mutations";
import { schoolZoneQueryOptions } from "../api/settings.queries";

type SchoolZone = NonNullable<SchoolZoneChoice["zone"]>;

type ZoneOption = SchoolZone | "none";

const ZONE_OPTIONS = [
  "none",
  "zone-a",
  "zone-b",
  "zone-c",
  "corse",
  "guadeloupe",
  "guyane",
  "martinique",
  "mayotte",
  "reunion",
] as const satisfies readonly ZoneOption[];

interface Academy {
  id: string;
  name: string;
  zone: SchoolZone;
}

interface SchoolZoneValues {
  academy: string;
  zone: ZoneOption;
}

export interface SchoolHolidaysCardProps {
  userId: string;
}

export function SchoolHolidaysCard({ userId }: SchoolHolidaysCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = useQuery(schoolZoneQueryOptions(userId));
  const save = useMutation({
    ...setSchoolZoneMutationOptions,
    onSuccess: (saved) => {
      queryClient.setQueryData(schoolZoneQueryOptions(userId).queryKey, saved);
      void queryClient.invalidateQueries({ queryKey: SCHOOL_CALENDAR_KEY });
      toastSuccess(t("schoolHolidays.saved"));
    },
    onError: (error) => toastError(error, errorFallback("setSchoolZone")),
  });

  return (
    <SectionCard title={t("schoolHolidays.title")} description={t("schoolHolidays.description")}>
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("schoolHolidays.loading")}>
            <Skeleton className="h-24 w-full" />
          </SkeletonGroup>
        }
      >
        {({ zone, academies }) => (
          <SchoolZoneForm
            key={zone ?? "none"}
            zone={zone ?? "none"}
            academies={academies}
            pending={save.isPending}
            onSubmit={(next) => save.mutate({ zone: next === "none" ? null : next })}
          />
        )}
      </QueryState>
    </SectionCard>
  );
}

interface SchoolZoneFormProps {
  zone: ZoneOption;
  academies: readonly Academy[];
  pending: boolean;
  onSubmit: (zone: ZoneOption) => void;
}

function SchoolZoneForm({ zone, academies, pending, onSubmit }: SchoolZoneFormProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const form = useForm<SchoolZoneValues>({ defaultValues: { academy: "", zone } });

  const proposeZoneOf = (academyId: string) => {
    const academy = academies.find(({ id }) => id === academyId);
    if (academy) form.setValue("zone", academy.zone, { shouldDirty: true });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(values.zone))}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="academy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("schoolHolidays.academy")}</FormLabel>
              <Select
                value={field.value}
                onValueChange={(academyId) => {
                  field.onChange(academyId);
                  proposeZoneOf(academyId);
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t("schoolHolidays.academyPlaceholder")} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {academies.map((academy) => (
                    <SelectItem key={academy.id} value={academy.id}>
                      {academy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>{t("schoolHolidays.academyHint")}</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="zone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("schoolHolidays.zone")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ZONE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`schoolHolidays.zones.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.value === "none" && (
                <FormDescription>{t("schoolHolidays.missing")}</FormDescription>
              )}
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" className="self-start" disabled={pending}>
          {tCommon("actions.save")}
        </Button>
      </form>
    </Form>
  );
}

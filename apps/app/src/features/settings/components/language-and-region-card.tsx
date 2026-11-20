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
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { assistantPreferencesQueryOptions } from "../../../shared/api/queries/assistant-preferences";
import { QueryState } from "../../../shared/query/query-state";
import {
  type LanguageAndRegionChoice,
  setLanguageAndRegionMutationOptions,
} from "../api/settings.mutations";
import {
  COUNTRY_OPTIONS,
  languageAndRegionOrDevice,
  languageAutonym,
  PARENT_LOCALES,
  timeZoneLabel,
  timeZoneOptions,
} from "../language-and-region";

export interface LanguageAndRegionCardProps {
  userId: string;
}

export function LanguageAndRegionCard({ userId }: LanguageAndRegionCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = useQuery(assistantPreferencesQueryOptions(userId));
  const save = useMutation({
    ...setLanguageAndRegionMutationOptions,
    onSuccess: (saved) => {
      queryClient.setQueryData(assistantPreferencesQueryOptions(userId).queryKey, saved);
      toastSuccess(t("languageAndRegion.saved"));
    },
    onError: (error) => toastError(error, errorFallback("setLanguageAndRegion")),
  });

  return (
    <SectionCard
      title={t("languageAndRegion.title")}
      description={t("languageAndRegion.description")}
    >
      <QueryState
        query={query}
        skeleton={
          <SkeletonGroup label={t("languageAndRegion.loading")}>
            <Skeleton className="h-48 w-full" />
          </SkeletonGroup>
        }
      >
        {(stored) => (
          <LanguageAndRegionForm
            key={[stored.locale, stored.timeZone, stored.country].join("|")}
            initial={languageAndRegionOrDevice(stored)}
            fromDevice={stored.locale === null}
            pending={save.isPending}
            onSubmit={(choice) => save.mutate(choice)}
          />
        )}
      </QueryState>
    </SectionCard>
  );
}

interface LanguageAndRegionFormProps {
  initial: LanguageAndRegionChoice;
  fromDevice: boolean;
  pending: boolean;
  onSubmit: (choice: LanguageAndRegionChoice) => void;
}

function LanguageAndRegionForm({
  initial,
  fromDevice,
  pending,
  onSubmit,
}: LanguageAndRegionFormProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const form = useForm<LanguageAndRegionChoice>({ defaultValues: initial });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {fromDevice && <TypographyMuted>{t("languageAndRegion.fromDevice")}</TypographyMuted>}
        <FormField
          control={form.control}
          name="locale"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("languageAndRegion.language")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PARENT_LOCALES.map((locale) => (
                    <SelectItem key={locale} value={locale} lang={locale}>
                      {languageAutonym(locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>{t("languageAndRegion.languageHint")}</FormDescription>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="timeZone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("languageAndRegion.timeZone")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {timeZoneOptions(initial.timeZone).map((timeZone) => (
                    <SelectItem key={timeZone} value={timeZone}>
                      {timeZoneLabel(timeZone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("languageAndRegion.country")}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {COUNTRY_OPTIONS.map(({ code, name }) => (
                    <SelectItem key={code} value={code}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

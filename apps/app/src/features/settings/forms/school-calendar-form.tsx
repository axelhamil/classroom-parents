import { Alert, AlertAction, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@packages/ui/components/ui/form";
import { NoCalendarIcon } from "@packages/ui/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { type UseFormReturn, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useIntlLocale } from "../../../shared/i18n/use-intl-locale";
import type { SchoolCalendarChoice } from "../api/school-calendar.mutations";
import {
  type SchoolCalendarSettings,
  type SchoolHolidayMode,
  schoolCalendarRegionsQueryOptions,
} from "../api/school-calendar.queries";
import { CountryCombobox, type CountryOption } from "../components/country-combobox";
import { SchoolCalendarPreview } from "../components/school-calendar-preview";

const FRANCE = "FR";

const UNKNOWN_REGION = "unknown";

const MODES = ["official", "own", "unknown"] as const satisfies readonly SchoolHolidayMode[];

type Country = SchoolCalendarSettings["countries"][number];

interface SchoolCalendarValues {
  country: string | null;
  region: string;
  academy: string;
  schoolHolidays: SchoolHolidayMode;
}

function initialValues({
  choice,
  suggestedCountry,
  countries,
}: SchoolCalendarSettings): SchoolCalendarValues {
  const country = choice?.country ?? suggestedCountry;

  return {
    country,
    region: choice?.region ?? UNKNOWN_REGION,
    academy: "",
    schoolHolidays:
      choice?.schoolHolidays ?? defaultModeOf(countries.find(({ code }) => code === country)),
  };
}

function defaultModeOf(country: Country | undefined): SchoolHolidayMode {
  return country?.officialSchoolHolidays === false ? "own" : "official";
}

function choiceOf(values: SchoolCalendarValues): SchoolCalendarChoice {
  if (values.country === null) return null;

  return {
    country: values.country,
    region: values.region === UNKNOWN_REGION ? null : values.region,
    schoolHolidays: values.schoolHolidays,
  };
}

function useCountryOptions(countries: readonly Country[]): readonly CountryOption[] {
  const locale = useIntlLocale();

  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region", fallback: "code" });

    return countries
      .map(({ code }) => ({ code, name: names.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [countries, locale]);
}

function sameChoice(
  chosen: SchoolCalendarChoice,
  saved: SchoolCalendarSettings["choice"],
): boolean {
  if (chosen === null || saved === null) return chosen === saved;

  return (
    chosen.country === saved.country &&
    chosen.region === saved.region &&
    chosen.schoolHolidays === saved.schoolHolidays
  );
}

export interface SchoolCalendarFormProps {
  settings: SchoolCalendarSettings;
  pending: boolean;
  onSubmit: (choice: SchoolCalendarChoice) => Promise<boolean>;
  ownHolidays: (beforeEdit: () => Promise<boolean>) => ReactNode;
}

/**
 * The school calendar of the family: country, region, and where the school holidays come from.
 * Where no school calendar is published, the school's own holidays are offered at once; the
 * choice is saved before the first import or typed period, so they show in the agenda.
 */
export function SchoolCalendarForm({
  settings,
  pending,
  onSubmit,
  ownHolidays,
}: SchoolCalendarFormProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const form = useForm<SchoolCalendarValues>({ defaultValues: initialValues(settings) });
  const options = useCountryOptions(settings.countries);
  const [country, region, schoolHolidays] = useWatch({
    control: form.control,
    name: ["country", "region", "schoolHolidays"],
  });
  const coverage = settings.countries.find(({ code }) => code === country);
  const chosenRegion = region === UNKNOWN_REGION ? null : region;
  const suggested =
    settings.choice === null && country !== null && country === settings.suggestedCountry;

  const chooseOwnHolidays = () => form.setValue("schoolHolidays", "own", { shouldDirty: true });

  const commitChoice = async () => {
    const chosen = choiceOf(form.getValues());

    return sameChoice(chosen, settings.choice) || onSubmit(chosen);
  };

  const chooseCountry = (code: string | null) => {
    form.setValue("country", code, { shouldDirty: true });
    form.setValue("region", UNKNOWN_REGION);
    form.setValue("academy", "");
    form.setValue("schoolHolidays", defaultModeOf(settings.countries.find((c) => c.code === code)));
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onSubmit(choiceOf(values)))}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormField
          control={form.control}
          name="country"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("schoolHolidays.country")}</FormLabel>
              <CountryCombobox
                value={field.value}
                options={options}
                onChange={chooseCountry}
                placeholder={t("schoolHolidays.countryPlaceholder")}
                searchLabel={t("schoolHolidays.countrySearch")}
                emptyLabel={t("schoolHolidays.countryEmpty")}
                unknownLabel={t("schoolHolidays.countryUnknown")}
              />
              {field.value === null && (
                <FormDescription>{t("schoolHolidays.missing")}</FormDescription>
              )}
              {suggested && (
                <FormDescription>{t("schoolHolidays.countrySuggested")}</FormDescription>
              )}
            </FormItem>
          )}
        />
        {country === FRANCE && <AcademyField form={form} academies={settings.academies} />}
        {country !== null && <RegionField form={form} country={country} />}
        {coverage && !coverage.officialSchoolHolidays && (
          <NoSchoolData
            country={options.find(({ code }) => code === country)?.name ?? coverage.code}
            onUseOwn={schoolHolidays === "own" ? undefined : chooseOwnHolidays}
          />
        )}
        {coverage && <ModeField form={form} coverage={coverage} />}
        {country !== null && (
          <SchoolCalendarPreview
            country={country}
            region={chosenRegion}
            showsHolidays={schoolHolidays === "official"}
            onUseOwn={chooseOwnHolidays}
          />
        )}
        <Button type="submit" size="sm" className="self-start" disabled={pending}>
          {tCommon("actions.save")}
        </Button>
      </form>
      {country !== null && schoolHolidays === "own" && ownHolidays(commitChoice)}
    </Form>
  );
}

interface NoSchoolDataProps {
  country: string;
  onUseOwn: (() => void) | undefined;
}

function NoSchoolData({ country, onUseOwn }: NoSchoolDataProps) {
  const { t } = useTranslation("settings");

  return (
    <Alert>
      <NoCalendarIcon aria-hidden />
      <AlertTitle>{t("schoolHolidays.noSchoolData", { country })}</AlertTitle>
      <AlertDescription>{t("schoolHolidays.noSchoolDataHint")}</AlertDescription>
      {onUseOwn && (
        <AlertAction>
          <Button type="button" size="sm" variant="outline" onClick={onUseOwn}>
            {t("schoolHolidays.useOwn")}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

interface AcademyFieldProps {
  form: UseFormReturn<SchoolCalendarValues>;
  academies: SchoolCalendarSettings["academies"];
}

function AcademyField({ form, academies }: AcademyFieldProps) {
  const { t } = useTranslation("settings");

  const proposeZoneOf = (academyId: string) => {
    const academy = academies.find(({ id }) => id === academyId);
    if (academy) form.setValue("region", academy.zone, { shouldDirty: true });
  };

  return (
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
  );
}

interface RegionFieldProps {
  form: UseFormReturn<SchoolCalendarValues>;
  country: string;
}

function RegionField({ form, country }: RegionFieldProps) {
  const { t } = useTranslation("settings");
  const regions = useQuery(schoolCalendarRegionsQueryOptions(country));
  if (!regions.data?.length) return null;

  return (
    <FormField
      control={form.control}
      name="region"
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {country === FRANCE ? t("schoolHolidays.regionFrance") : t("schoolHolidays.region")}
          </FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem value={UNKNOWN_REGION}>{t("schoolHolidays.regionUnknown")}</SelectItem>
              {regions.data.map(({ code, name }) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.value === UNKNOWN_REGION && (
            <FormDescription>{t("schoolHolidays.regionHint")}</FormDescription>
          )}
        </FormItem>
      )}
    />
  );
}

interface ModeFieldProps {
  form: UseFormReturn<SchoolCalendarValues>;
  coverage: Country;
}

function ModeField({ form, coverage }: ModeFieldProps) {
  const { t } = useTranslation("settings");
  const modes = MODES.filter((mode) => mode !== "official" || coverage.officialSchoolHolidays);

  return (
    <FormField
      control={form.control}
      name="schoolHolidays"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t("schoolHolidays.mode")}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {modes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`schoolHolidays.modes.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.value === "unknown" && (
            <FormDescription>{t("schoolHolidays.unknownHint")}</FormDescription>
          )}
        </FormItem>
      )}
    />
  );
}

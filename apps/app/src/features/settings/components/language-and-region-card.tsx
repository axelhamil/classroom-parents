import { Button } from "@packages/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/ui/select";
import {
  SettingsGroup,
  SettingsRow,
  settingsRowDescriptionId,
} from "@packages/ui/components/ui/settings";
import { Skeleton, SkeletonGroup } from "@packages/ui/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { assistantPreferencesQueryOptions } from "../../../shared/api/queries/assistant-preferences";
import { QueryState } from "../../../shared/query/query-state";
import {
  type LanguageAndRegionChoice,
  setLanguageAndRegionMutationOptions,
} from "../api/settings.mutations";
import { useAutoSave } from "../hooks/use-auto-save";
import { useCalendarFollowsCountry } from "../hooks/use-calendar-follows-country";
import {
  COUNTRY_OPTIONS,
  isParentLocale,
  languageAndRegionOrDevice,
  languageAutonym,
  PARENT_LOCALES,
  type ParentLocale,
  timeZoneLabel,
  timeZoneOptions,
} from "../language-and-region";
import { SETTINGS_ANCHORS } from "../settings-search-index";
import { CountryCombobox } from "./country-combobox";

export interface LanguageAndRegionCardProps {
  userId: string;
}

export function LanguageAndRegionCard({ userId }: LanguageAndRegionCardProps) {
  const { t } = useTranslation("settings");
  const query = assistantPreferencesQueryOptions(userId);
  const preferences = useQuery(query);
  const followCountry = useCalendarFollowsCountry(userId);
  const { save } = useAutoSave({
    mutation: setLanguageAndRegionMutationOptions,
    queryKey: query.queryKey,
    apply: (stored, choice) => ({ ...stored, ...choice }),
    merge: (_stored, saved) => saved,
    restoreValue: (stored) => languageAndRegionOrDevice(stored),
    failure: "setLanguageAndRegion",
    onSaved: (saved) => {
      if (saved.country) followCountry(saved.country);
    },
  });

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.languageAndRegion} title={t("languageAndRegion.title")}>
      <QueryState
        query={preferences}
        skeleton={
          <SkeletonGroup label={t("languageAndRegion.loading")}>
            <Skeleton className="h-32 w-full" />
          </SkeletonGroup>
        }
      >
        {(stored) => {
          const choice = languageAndRegionOrDevice(stored);
          const change = (patch: Partial<LanguageAndRegionChoice>) => save({ ...choice, ...patch });

          return (
            <>
              {stored.locale === null ? <FromDevice onKeep={() => save(choice)} /> : null}
              <LanguageRow value={choice.locale} onChange={(locale) => change({ locale })} />
              <TimeZoneRow value={choice.timeZone} onChange={(timeZone) => change({ timeZone })} />
              <CountryRow value={choice.country} onChange={(country) => change({ country })} />
            </>
          );
        }}
      </QueryState>
    </SettingsGroup>
  );
}

function FromDevice({ onKeep }: { onKeep: () => void }) {
  const { t } = useTranslation("settings");

  return (
    <SettingsRow
      label={t("languageAndRegion.fromDeviceTitle")}
      description={t("languageAndRegion.fromDevice")}
      control={
        <Button type="button" size="sm" variant="outline" onClick={onKeep}>
          {t("languageAndRegion.keep")}
        </Button>
      }
    />
  );
}

interface ChoiceRowProps {
  value: string;
  onChange: (value: string) => void;
}

interface LanguageRowProps {
  value: ParentLocale;
  onChange: (locale: ParentLocale) => void;
}

function LanguageRow({ value, onChange }: LanguageRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();

  return (
    <SettingsRow
      label={t("languageAndRegion.language")}
      description={t("languageAndRegion.languageHint")}
      controlId={id}
      control={
        <Select
          value={value}
          onValueChange={(locale) => {
            if (isParentLocale(locale)) onChange(locale);
          }}
        >
          <SelectTrigger id={id} aria-describedby={settingsRowDescriptionId(id)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARENT_LOCALES.map((locale) => (
              <SelectItem key={locale} value={locale} lang={locale}>
                {languageAutonym(locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

function TimeZoneRow({ value, onChange }: ChoiceRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();

  return (
    <SettingsRow
      label={t("languageAndRegion.timeZone")}
      controlId={id}
      control={
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeZoneOptions(value).map((timeZone) => (
              <SelectItem key={timeZone} value={timeZone}>
                {timeZoneLabel(timeZone)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

function CountryRow({ value, onChange }: ChoiceRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();

  return (
    <SettingsRow
      label={t("languageAndRegion.country")}
      description={t("languageAndRegion.countryHint")}
      controlId={id}
      control={
        <CountryCombobox
          id={id}
          aria-describedby={settingsRowDescriptionId(id)}
          value={value}
          options={COUNTRY_OPTIONS}
          onChange={onChange}
          searchLabel={t("languageAndRegion.countrySearch")}
          emptyLabel={t("languageAndRegion.countryEmpty")}
        />
      }
    />
  );
}

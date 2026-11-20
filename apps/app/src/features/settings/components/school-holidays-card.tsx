import { Alert, AlertAction, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { NoCalendarIcon } from "@packages/ui/components/ui/icons";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { assistantPreferencesQueryOptions } from "../../../shared/api/queries/assistant-preferences";
import { SCHOOL_CALENDAR_KEY } from "../../../shared/api/queries/school-calendar";
import { QueryState } from "../../../shared/query/query-state";
import {
  type SchoolCalendarChoice,
  setSchoolCalendarMutationOptions,
} from "../api/school-calendar.mutations";
import {
  type SchoolCalendarSettings,
  schoolCalendarRegionsQueryOptions,
  schoolCalendarSettingsQueryOptions,
} from "../api/school-calendar.queries";
import { useAutoSave } from "../hooks/use-auto-save";
import { countryName, languageAndRegionOrDevice } from "../language-and-region";
import {
  type CalendarCountry,
  choiceFor,
  coverageOf,
  FRANCE,
  HOLIDAY_MODES,
  type SavedChoice,
  UNKNOWN_REGION,
} from "../school-calendar";
import { SETTINGS_ANCHORS } from "../settings-search-index";
import { OwnHolidays } from "./own-holidays";
import { SchoolCalendarPreview } from "./school-calendar-preview";

export interface SchoolHolidaysCardProps {
  userId: string;
}

export function SchoolHolidaysCard({ userId }: SchoolHolidaysCardProps) {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const query = schoolCalendarSettingsQueryOptions(userId);
  const settings = useQuery(query);
  const preferences = useQuery(assistantPreferencesQueryOptions(userId));
  const { save } = useAutoSave({
    mutation: setSchoolCalendarMutationOptions,
    queryKey: query.queryKey,
    apply: (stored, choice) => ({
      ...stored,
      choice: choice === null ? null : { ...choice, source: stored.choice?.source ?? "none" },
    }),
    merge: (stored, choice) => ({ ...stored, choice }),
    restoreValue: ({ choice }) => choice,
    failure: "setSchoolCalendar",
    onSaved: () => void queryClient.invalidateQueries({ queryKey: SCHOOL_CALENDAR_KEY }),
  });
  const country = preferences.data ? languageAndRegionOrDevice(preferences.data).country : null;

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.schoolCalendar} title={t("schoolHolidays.title")}>
      <QueryState
        query={settings}
        skeleton={
          <SkeletonGroup label={t("schoolHolidays.loading")}>
            <Skeleton className="h-24 w-full" />
          </SkeletonGroup>
        }
      >
        {(stored) => (
          <SchoolCalendarRows
            settings={stored}
            country={country ?? stored.choice?.country ?? stored.suggestedCountry ?? FRANCE}
            onChoose={save}
          />
        )}
      </QueryState>
    </SettingsGroup>
  );
}

interface SchoolCalendarRowsProps {
  settings: SchoolCalendarSettings;
  country: string;
  onChoose: (choice: SchoolCalendarChoice) => void;
}

function SchoolCalendarRows({ settings, country, onChoose }: SchoolCalendarRowsProps) {
  const { t } = useTranslation("settings");
  const { choice } = settings;
  const coverage = coverageOf(settings, country);

  if (choice === null || choice.country !== country) {
    return <CalendarOffer country={country} coverage={coverage} onChoose={onChoose} />;
  }

  const chosenCoverage = coverage ?? coverageOf(settings, choice.country);
  const change = (patch: Partial<SavedChoice>) => onChoose({ ...choice, ...patch });
  const switchToOwn = () => change({ schoolHolidays: "own" });

  return (
    <>
      {choice.country === FRANCE ? (
        <AcademyRow academies={settings.academies} onZone={(region) => change({ region })} />
      ) : null}
      <RegionRow
        country={choice.country}
        value={choice.region}
        onChange={(region) => change({ region })}
      />
      {chosenCoverage ? (
        <ModeRow
          coverage={chosenCoverage}
          value={choice.schoolHolidays}
          onChange={(schoolHolidays) => change({ schoolHolidays })}
        />
      ) : null}
      {chosenCoverage && !chosenCoverage.officialSchoolHolidays ? (
        <NoSchoolData
          country={countryName(choice.country)}
          onUseOwn={choice.schoolHolidays === "own" ? undefined : switchToOwn}
        />
      ) : null}
      <SettingsRow label={t("schoolHolidays.preview")}>
        <SchoolCalendarPreview
          country={choice.country}
          region={choice.region}
          showsHolidays={choice.schoolHolidays === "official"}
          onUseOwn={switchToOwn}
        />
      </SettingsRow>
      {choice.schoolHolidays === "own" ? <OwnHolidays periods={settings.periods} /> : null}
    </>
  );
}

interface CalendarOfferProps {
  country: string;
  coverage: CalendarCountry | undefined;
  onChoose: (choice: SchoolCalendarChoice) => void;
}

function CalendarOffer({ country, coverage, onChoose }: CalendarOfferProps) {
  const { t } = useTranslation("settings");
  const name = countryName(country);

  if (!coverage)
    return (
      <SettingsRow
        label={t("schoolHolidays.none", { country: name })}
        description={t("schoolHolidays.noneHint")}
      />
    );

  return (
    <SettingsRow
      label={t("schoolHolidays.offer", { country: name })}
      description={t("schoolHolidays.missing")}
      control={
        <Button type="button" size="sm" onClick={() => onChoose(choiceFor(coverage))}>
          {t("schoolHolidays.show")}
        </Button>
      }
    />
  );
}

interface AcademyRowProps {
  academies: SchoolCalendarSettings["academies"];
  onZone: (zone: string) => void;
}

function AcademyRow({ academies, onZone }: AcademyRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const [academy, setAcademy] = useState("");

  const pick = (academyId: string) => {
    setAcademy(academyId);
    const zone = academies.find(({ id: candidate }) => candidate === academyId)?.zone;
    if (zone) onZone(zone);
  };

  return (
    <SettingsRow
      label={t("schoolHolidays.academy")}
      description={t("schoolHolidays.academyHint")}
      controlId={id}
      control={
        <Select value={academy} onValueChange={pick}>
          <SelectTrigger id={id} aria-describedby={settingsRowDescriptionId(id)}>
            <SelectValue placeholder={t("schoolHolidays.academyPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {academies.map(({ id: academyId, name }) => (
              <SelectItem key={academyId} value={academyId}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

interface RegionRowProps {
  country: string;
  value: string | null;
  onChange: (region: string | null) => void;
}

function RegionRow({ country, value, onChange }: RegionRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const regions = useQuery(schoolCalendarRegionsQueryOptions(country));
  if (!regions.data?.length) return null;

  return (
    <SettingsRow
      label={country === FRANCE ? t("schoolHolidays.regionFrance") : t("schoolHolidays.region")}
      description={value === null ? t("schoolHolidays.regionHint") : undefined}
      controlId={id}
      control={
        <Select
          value={value ?? UNKNOWN_REGION}
          onValueChange={(region) => onChange(region === UNKNOWN_REGION ? null : region)}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNKNOWN_REGION}>{t("schoolHolidays.regionUnknown")}</SelectItem>
            {regions.data.map(({ code, name }) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

interface ModeRowProps {
  coverage: CalendarCountry;
  value: SavedChoice["schoolHolidays"];
  onChange: (mode: SavedChoice["schoolHolidays"]) => void;
}

function ModeRow({ coverage, value, onChange }: ModeRowProps) {
  const { t } = useTranslation("settings");
  const id = useId();
  const modes = HOLIDAY_MODES.filter(
    (mode) => mode !== "official" || coverage.officialSchoolHolidays,
  );

  const choose = (picked: string) => {
    const mode = modes.find((candidate) => candidate === picked);
    if (mode) onChange(mode);
  };

  return (
    <SettingsRow
      label={t("schoolHolidays.mode")}
      description={value === "unknown" ? t("schoolHolidays.unknownHint") : undefined}
      controlId={id}
      control={
        <Select value={value} onValueChange={choose}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {modes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(`schoolHolidays.modes.${mode}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
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

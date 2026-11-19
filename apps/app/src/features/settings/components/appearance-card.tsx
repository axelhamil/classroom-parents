import { DateTab } from "@packages/ui/components/ui/date-tab";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@packages/ui/components/ui/field";
import { PaletteSwatch } from "@packages/ui/components/ui/palette-swatch";
import {
  PlannerCard,
  PlannerCardBody,
  PlannerCardMeta,
  PlannerCardTitle,
} from "@packages/ui/components/ui/planner-card";
import { RadioGroup, RadioGroupItem } from "@packages/ui/components/ui/radio-group";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { isPalette, PALETTES } from "@packages/web-kit/theme/palette-store";
import { isThemePreference } from "@packages/web-kit/theme/theme-store";
import { usePalette } from "@packages/web-kit/theme/use-palette";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { THEME_OPTIONS } from "../../../shared/components/theme-toggle";
import { dayLabel, wallDateParts } from "../../../shared/format/deadline-label";
import { isoDay, localDay } from "../../../shared/format/local-day";
import { schoolToday } from "../../../shared/format/school-today";

function tomorrowOf(now: Date): string {
  const tomorrow = localDay(schoolToday(now));
  tomorrow.setDate(tomorrow.getDate() + 1);

  return isoDay(tomorrow);
}

export function AppearanceCard() {
  const { t } = useTranslation("settings");

  return (
    <SectionCard title={t("appearance.title")} description={t("appearance.description")}>
      <ModeChoice />
      <PaletteChoice />
    </SectionCard>
  );
}

function ModeChoice() {
  const { t } = useTranslation(["settings", "common"]);
  const { theme, changeTheme } = useTheme();
  const baseId = useId();

  const choose = (value: string) => {
    if (!isThemePreference(value)) return;

    void changeTheme(value, document.getElementById(`${baseId}-${value}`));
  };

  return (
    <FieldSet>
      <FieldLegend id={`${baseId}-legend`} variant="label">
        {t("appearance.mode")}
      </FieldLegend>
      <RadioGroup aria-labelledby={`${baseId}-legend`} value={theme} onValueChange={choose}>
        {THEME_OPTIONS.map(({ value, icon: Icon }) => (
          <FieldLabel key={value} htmlFor={`${baseId}-${value}`}>
            <Field orientation="horizontal">
              <Icon aria-hidden />
              <FieldContent>
                <FieldTitle id={`${baseId}-${value}-title`}>
                  {t(`common:theme.${value}`)}
                </FieldTitle>
              </FieldContent>
              <RadioGroupItem
                value={value}
                id={`${baseId}-${value}`}
                aria-labelledby={`${baseId}-${value}-title`}
              />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

function PaletteChoice() {
  const { t } = useTranslation("settings");
  const { palette, changePalette } = usePalette();
  const baseId = useId();
  const now = new Date();
  const tomorrow = tomorrowOf(now);
  const date = wallDateParts(tomorrow);
  const when = dayLabel(tomorrow, now);

  const choose = (value: string) => {
    if (!isPalette(value)) return;

    void changePalette(value, document.getElementById(`${baseId}-${value}`));
  };

  return (
    <FieldSet>
      <FieldLegend id={`${baseId}-legend`} variant="label">
        {t("appearance.palette")}
      </FieldLegend>
      <RadioGroup aria-labelledby={`${baseId}-legend`} value={palette} onValueChange={choose}>
        {PALETTES.map((value) => (
          <FieldLabel key={value} htmlFor={`${baseId}-${value}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle id={`${baseId}-${value}-title`}>
                  {t(`appearance.palettes.${value}.name`)}
                </FieldTitle>
                <FieldDescription id={`${baseId}-${value}-description`}>
                  {t(`appearance.palettes.${value}.description`)}
                </FieldDescription>
                <PaletteSwatch palette={value}>
                  <PlannerCard>
                    <DateTab dateTime={tomorrow} day={date.day} month={date.month} />
                    <PlannerCardBody>
                      <PlannerCardTitle>{t("appearance.sample")}</PlannerCardTitle>
                      <PlannerCardMeta>{when}</PlannerCardMeta>
                    </PlannerCardBody>
                  </PlannerCard>
                </PaletteSwatch>
              </FieldContent>
              <RadioGroupItem
                value={value}
                id={`${baseId}-${value}`}
                aria-labelledby={`${baseId}-${value}-title`}
                aria-describedby={`${baseId}-${value}-description`}
              />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

import { shiftDate } from "@packages/ddd-kit/days";
import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { FieldLegend, FieldSet } from "@packages/ui/components/ui/field";
import { HueDot } from "@packages/ui/components/ui/hue-dot";
import { AddIcon } from "@packages/ui/components/ui/icons";
import { PaletteChip, PaletteSwatch } from "@packages/ui/components/ui/palette-swatch";
import {
  PlannerCard,
  PlannerCardBody,
  PlannerCardMeta,
  PlannerCardTitle,
} from "@packages/ui/components/ui/planner-card";
import { RadioGroup, RadioTile } from "@packages/ui/components/ui/radio-group";
import { SettingsGroup } from "@packages/ui/components/ui/settings";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import {
  isPalette,
  PALETTE_FAMILIES,
  PALETTE_GROUPS,
  type Palette,
} from "@packages/web-kit/theme/palette-store";
import { isThemePreference } from "@packages/web-kit/theme/theme-store";
import { usePalette } from "@packages/web-kit/theme/use-palette";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import type * as React from "react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { THEME_OPTIONS } from "../../../shared/components/theme-toggle";
import { dayLabel } from "../../../shared/format/deadline-label";
import { SETTINGS_ANCHORS } from "../settings-search-index";

export function ThemeCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { theme, changeTheme } = useTheme();
  const baseId = useId();

  const choose = (value: string) => {
    if (!isThemePreference(value)) return;

    void changeTheme(value, document.getElementById(`${baseId}-${value}`));
  };

  return (
    <SettingsGroup
      id={SETTINGS_ANCHORS.theme}
      title={t("appearance.mode")}
      description={t("appearance.modeHint")}
    >
      <RadioGroup
        aria-label={t("appearance.mode")}
        value={theme}
        onValueChange={choose}
        className="grid-cols-3"
      >
        {THEME_OPTIONS.map(({ value, icon: Icon }) => (
          <RadioTile key={value} value={value} id={`${baseId}-${value}`}>
            <Icon aria-hidden />
            {t(`common:theme.${value}`)}
          </RadioTile>
        ))}
      </RadioGroup>
    </SettingsGroup>
  );
}

export function PaletteCard() {
  const { t } = useTranslation("settings");
  const { palette, changePalette } = usePalette();
  const [previewed, setPreviewed] = useState<Palette | null>(null);
  const baseId = useId();

  const choose = (value: string) => {
    if (!isPalette(value)) return;

    void changePalette(value, document.getElementById(`${baseId}-${value}`));
  };

  const endPreview = (event: React.FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;

    setPreviewed(null);
  };

  return (
    <SettingsGroup
      id={SETTINGS_ANCHORS.palette}
      title={t("appearance.palette")}
      description={t("appearance.paletteHint")}
      width="wide"
    >
      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_20rem] @4xl:items-start">
        <PalettePreview palette={previewed ?? palette} />
        <RadioGroup
          aria-label={t("appearance.palette")}
          value={palette}
          onValueChange={choose}
          onPointerLeave={() => setPreviewed(null)}
          onBlur={endPreview}
          className="gap-5 @4xl:order-first"
        >
          {PALETTE_FAMILIES.map((family) => (
            <FieldSet key={family} className="gap-2">
              <FieldLegend variant="label">{t(`appearance.groups.${family}`)}</FieldLegend>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                {PALETTE_GROUPS[family].map((value) => (
                  <RadioTile
                    key={value}
                    value={value}
                    id={`${baseId}-${value}`}
                    aria-label={t(`appearance.palettes.${value}.name`)}
                    aria-description={t(`appearance.palettes.${value}.description`)}
                    onPointerEnter={() => setPreviewed(value)}
                    onFocus={() => setPreviewed(value)}
                    className="items-stretch"
                  >
                    <PaletteChip palette={value} />
                    {t(`appearance.palettes.${value}.name`)}
                  </RadioTile>
                ))}
              </div>
            </FieldSet>
          ))}
        </RadioGroup>
      </div>
    </SettingsGroup>
  );
}

const SAMPLE_CHILDREN = [2, 9, 14] as const;

function PalettePreview({ palette }: { palette: Palette }) {
  const { t } = useTranslation("settings");
  const { today } = useSchoolClock();
  const tomorrow = shiftDate(today, 1);

  return (
    <div className="flex flex-col gap-2 @4xl:sticky @4xl:top-app-bar">
      <PaletteSwatch palette={palette} className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <ChildAvatar name={t("appearance.sampleChild")} tone={1} size="sm" />
          <Badge>
            <AddIcon aria-hidden />
            {t("appearance.sampleAction")}
          </Badge>
        </div>
        <PlannerCard hue={1}>
          <PlannerCardBody>
            <PlannerCardTitle className="line-clamp-1">{t("appearance.sample")}</PlannerCardTitle>
            <PlannerCardMeta>{dayLabel(tomorrow, today)}</PlannerCardMeta>
          </PlannerCardBody>
        </PlannerCard>
        <PlannerCard hue={9}>
          <PlannerCardBody>
            <PlannerCardTitle className="line-clamp-1">
              {t("appearance.sampleSecond")}
            </PlannerCardTitle>
            <PlannerCardMeta>{dayLabel(shiftDate(today, 3), today)}</PlannerCardMeta>
          </PlannerCardBody>
        </PlannerCard>
        <div className="flex items-center gap-1">
          {SAMPLE_CHILDREN.map((hue) => (
            <HueDot key={hue} hue={hue} />
          ))}
        </div>
      </PaletteSwatch>
      <TypographyMuted>
        {t("appearance.previewOf", { name: t(`appearance.palettes.${palette}.name`) })}
      </TypographyMuted>
    </div>
  );
}

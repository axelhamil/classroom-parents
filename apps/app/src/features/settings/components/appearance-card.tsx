import { shiftDate } from "@packages/ddd-kit/days";
import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@packages/ui/components/ui/field";
import { HueDot } from "@packages/ui/components/ui/hue-dot";
import { PaletteSwatch } from "@packages/ui/components/ui/palette-swatch";
import {
  PlannerCard,
  PlannerCardBody,
  PlannerCardMeta,
  PlannerCardTitle,
} from "@packages/ui/components/ui/planner-card";
import { RadioGroup, RadioGroupItem } from "@packages/ui/components/ui/radio-group";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import {
  isPalette,
  PALETTE_FAMILIES,
  PALETTE_GROUPS,
  type Palette,
} from "@packages/web-kit/theme/palette-store";
import { isThemePreference } from "@packages/web-kit/theme/theme-store";
import { usePalette } from "@packages/web-kit/theme/use-palette";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { PlusIcon } from "lucide-react";
import type * as React from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { THEME_OPTIONS } from "../../../shared/components/theme-toggle";
import { dayLabel } from "../../../shared/format/deadline-label";

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
  const { palette, changePalette, previewPalette } = usePalette();
  const baseId = useId();

  const choose = (value: string) => {
    if (!isPalette(value)) return;

    void changePalette(value, document.getElementById(`${baseId}-${value}`));
  };

  const endPreview = (event: React.FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;

    previewPalette(null);
  };

  return (
    <FieldSet>
      <FieldLegend id={`${baseId}-legend`} variant="label">
        {t("appearance.palette")}
      </FieldLegend>
      <FieldDescription>{t("appearance.paletteHint")}</FieldDescription>
      <RadioGroup
        aria-labelledby={`${baseId}-legend`}
        value={palette}
        onValueChange={choose}
        onPointerLeave={() => previewPalette(null)}
        onBlur={endPreview}
        className="gap-6"
      >
        {PALETTE_FAMILIES.map((family) => (
          <FieldSet key={family} className="gap-3">
            <FieldLegend variant="label">{t(`appearance.groups.${family}`)}</FieldLegend>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3">
              {PALETTE_GROUPS[family].map((value) => (
                <PaletteOption
                  key={value}
                  palette={value}
                  id={`${baseId}-${value}`}
                  onPreview={() => previewPalette(value)}
                />
              ))}
            </div>
          </FieldSet>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}

interface PaletteOptionProps {
  palette: Palette;
  id: string;
  onPreview: () => void;
}

function PaletteOption({ palette, id, onPreview }: PaletteOptionProps) {
  const { t } = useTranslation("settings");

  return (
    <FieldLabel htmlFor={id} onPointerEnter={onPreview}>
      <Field>
        <PaletteSwatch palette={palette}>
          <PaletteSample />
        </PaletteSwatch>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle id={`${id}-title`}>{t(`appearance.palettes.${palette}.name`)}</FieldTitle>
            <FieldDescription id={`${id}-description`}>
              {t(`appearance.palettes.${palette}.description`)}
            </FieldDescription>
          </FieldContent>
          <RadioGroupItem
            value={palette}
            id={id}
            onFocus={onPreview}
            aria-labelledby={`${id}-title`}
            aria-describedby={`${id}-description`}
          />
        </Field>
      </Field>
    </FieldLabel>
  );
}

const SAMPLE_CHILDREN = [2, 9, 14] as const;

function PaletteSample() {
  const { t } = useTranslation("settings");
  const { today } = useSchoolClock();
  const tomorrow = shiftDate(today, 1);

  return (
    <>
      <PlannerCard hue={1}>
        <PlannerCardBody>
          <PlannerCardTitle className="line-clamp-1">{t("appearance.sample")}</PlannerCardTitle>
          <PlannerCardMeta>{dayLabel(tomorrow, today)}</PlannerCardMeta>
        </PlannerCardBody>
      </PlannerCard>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <ChildAvatar name={t("appearance.sampleChild")} tone={1} size="xs" />
          {SAMPLE_CHILDREN.map((hue) => (
            <HueDot key={hue} hue={hue} />
          ))}
        </div>
        <Badge>
          <PlusIcon aria-hidden />
          {t("appearance.sampleAction")}
        </Badge>
      </div>
    </>
  );
}

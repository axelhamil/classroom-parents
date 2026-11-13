import { Field, FieldContent, FieldLabel, FieldTitle } from "@packages/ui/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@packages/ui/components/ui/radio-group";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { isThemePreference } from "@packages/web-kit/theme/theme-store";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { THEME_OPTIONS } from "../../../shared/components/theme-toggle";

export function AppearanceCard() {
  const { t } = useTranslation(["settings", "common"]);
  const { theme, changeTheme } = useTheme();
  const baseId = useId();

  const choose = (value: string) => {
    if (!isThemePreference(value)) return;

    void changeTheme(value, document.getElementById(`${baseId}-${value}`));
  };

  return (
    <SectionCard title={t("appearance.title")} description={t("appearance.description")}>
      <RadioGroup aria-label={t("appearance.title")} value={theme} onValueChange={choose}>
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
    </SectionCard>
  );
}

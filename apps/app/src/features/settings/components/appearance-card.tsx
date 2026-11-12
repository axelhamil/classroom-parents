import { Field, FieldContent, FieldLabel, FieldTitle } from "@packages/ui/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@packages/ui/components/ui/radio-group";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { revealThemeChange } from "@packages/web-kit/theme/reveal-transition";
import { useTheme } from "@packages/web-kit/theme/use-theme";
import { type LucideIcon, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

type ThemeChoice = "light" | "dark";

interface ThemeOption {
  value: ThemeChoice;
  key: "appearance.light" | "appearance.dark";
  icon: LucideIcon;
}

const OPTIONS: readonly ThemeOption[] = [
  { value: "light", key: "appearance.light", icon: Sun },
  { value: "dark", key: "appearance.dark", icon: Moon },
];

function isThemeChoice(value: string): value is ThemeChoice {
  return OPTIONS.some((option) => option.value === value);
}

export function AppearanceCard() {
  const { t } = useTranslation("settings");
  const { resolvedTheme, setTheme } = useTheme();
  const baseId = useId();

  const choose = (value: string) => {
    if (!isThemeChoice(value)) return;

    void revealThemeChange(document.getElementById(`${baseId}-${value}`), () => setTheme(value));
  };

  return (
    <SectionCard title={t("appearance.title")} description={t("appearance.description")}>
      <RadioGroup
        aria-label={t("appearance.title")}
        value={resolvedTheme}
        onValueChange={choose}
        className="grid-cols-2"
      >
        {OPTIONS.map(({ value, key, icon: Icon }) => (
          <FieldLabel key={value} htmlFor={`${baseId}-${value}`}>
            <Field orientation="horizontal">
              <Icon aria-hidden />
              <FieldContent>
                <FieldTitle>{t(key)}</FieldTitle>
              </FieldContent>
              <RadioGroupItem value={value} id={`${baseId}-${value}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </SectionCard>
  );
}

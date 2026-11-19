import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { Field, FieldContent, FieldLabel, FieldTitle } from "@packages/ui/components/ui/field";
import { FormField, FormItem, FormLabel } from "@packages/ui/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@packages/ui/components/ui/radio-group";
import { useId } from "react";
import { type Control, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../api/queries/children";
import { childAvatarSrc } from "./child-avatar-src";
import type { ChildProfileInput } from "./child-profile.schema";

export interface ChildAvatarFieldProps {
  control: Control<ChildProfileInput>;
  child: ChildDto;
}

const CHOICES = [
  { value: "initial", showsPhoto: false, labelKey: "customize.initial" },
  { value: "photo", showsPhoto: true, labelKey: "customize.photo" },
] as const;

export function ChildAvatarField({ control, child }: ChildAvatarFieldProps) {
  const { t } = useTranslation("children");
  const baseId = useId();
  const [typed, hue] = useWatch({ control, name: ["label", "color"] });
  const photo = child.avatarUrl;
  if (!photo) return null;

  const name = typed.trim() || child.label;

  return (
    <FormField
      control={control}
      name="showsPhoto"
      render={({ field }) => (
        <FormItem>
          <FormLabel id={`${baseId}-label`}>{t("customize.avatar")}</FormLabel>
          <RadioGroup
            aria-labelledby={`${baseId}-label`}
            value={field.value ? "photo" : "initial"}
            onValueChange={(picked) => field.onChange(picked === "photo")}
          >
            {CHOICES.map(({ value, showsPhoto, labelKey }) => (
              <FieldLabel key={value} htmlFor={`${baseId}-${value}`}>
                <Field orientation="horizontal">
                  <ChildAvatar
                    name={name}
                    tone={hue}
                    src={childAvatarSrc({ avatarUrl: photo, showsPhoto })}
                    size="sm"
                  />
                  <FieldContent>
                    <FieldTitle id={`${baseId}-${value}-title`}>{t(labelKey)}</FieldTitle>
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
        </FormItem>
      )}
    />
  );
}

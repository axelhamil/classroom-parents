import { FormField, FormItem, FormLabel, FormMessage } from "@packages/ui/components/ui/form";
import { HueRadioGroup, type HueSwatch } from "@packages/ui/components/ui/hue-radio-group";
import { initialsOf } from "@packages/ui/libs/initials.js";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useId } from "react";
import type { Control } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type ChildDto, childrenQueryOptions } from "../api/queries/children";
import { HUES } from "../format/child-hue";
import { CHILD_HUE_LABEL_KEYS } from "./child-hue-labels";
import type { ChildProfileInput } from "./child-profile.schema";

export interface ChildHueFieldProps {
  control: Control<ChildProfileInput>;
  childId: string;
}

function swatchesFor(
  siblings: readonly ChildDto[],
  t: TFunction<"children">,
): readonly HueSwatch[] {
  return HUES.map((hue) => {
    const wearer = siblings.find((sibling) => sibling.color === hue);
    const label = t(CHILD_HUE_LABEL_KEYS[hue]);
    if (!wearer) return { hue, label };

    return {
      hue,
      label,
      mark: initialsOf(wearer.label),
      note: t("customize.takenBy", { label: wearer.label }),
    };
  });
}

export function ChildHueField({ control, childId }: ChildHueFieldProps) {
  const { t } = useTranslation("children");
  const labelId = useId();
  const family = useQuery(childrenQueryOptions);
  const siblings = (family.data ?? []).filter(
    (sibling) => sibling.id !== childId && sibling.status !== "disconnecting",
  );

  return (
    <FormField
      control={control}
      name="color"
      render={({ field }) => (
        <FormItem>
          <FormLabel id={labelId}>{t("customize.color")}</FormLabel>
          <HueRadioGroup
            aria-labelledby={labelId}
            swatches={swatchesFor(siblings, t)}
            value={field.value}
            onValueChange={field.onChange}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

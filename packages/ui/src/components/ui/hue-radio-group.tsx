import { cva } from "class-variance-authority";
import { CheckIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type ComponentProps, useId } from "react";

import { type ChildTone, childHueFill } from "../../libs/child-hue-classes";
import { cn } from "../../libs/utils";
import { RadioGroup } from "./radio-group";

const swatchVariants = cva(
  "group/swatch flex aspect-square w-full items-center justify-center rounded-full text-xs font-semibold text-child-foreground outline-offset-2 transition-[outline-color,scale] duration-(--press-duration) ease-(--ease-out) active:scale-(--press-scale) data-[state=checked]:outline-2 data-[state=checked]:outline-foreground focus-visible:outline-(length:--ring-width) focus-visible:outline-ring",
  {
    variants: {
      tone: childHueFill,
    },
  },
);

/**
 * One choosable hue. `label` is its accessible name ("Bleu"); `mark` is a short
 * visible sign drawn on the swatch while it is not selected (the initials of the
 * child who already wears it) and `note` the sentence a screen reader hears for it.
 * Copy comes from the caller: the primitive holds none of its own.
 */
export interface HueSwatch {
  hue: ChildTone;
  label: string;
  mark?: string;
  note?: string;
}

/** Controlled only: `value` is the selected hue, `onValueChange` receives the typed hue. */
export interface HueRadioGroupProps
  extends Omit<
    ComponentProps<typeof RadioGroupPrimitive.Root>,
    "value" | "defaultValue" | "onValueChange" | "children"
  > {
  swatches: readonly HueSwatch[];
  value: ChildTone;
  onValueChange: (hue: ChildTone) => void;
}

/**
 * A radio group of color swatches drawn from the `--child-N` tokens, laid out
 * in rows of 8 whose swatches shrink below 2.5rem so 16 hues fit a 360px wide
 * phone. Arrow keys move and select (Radix roving focus), the selected swatch
 * carries a check and a foreground outline, keyboard focus a `--ring` outline.
 */
function HueRadioGroup({
  swatches,
  value,
  onValueChange,
  className,
  ...props
}: HueRadioGroupProps) {
  const baseId = useId();

  const choose = (picked: string) => {
    const swatch = swatches.find(({ hue }) => String(hue) === picked);
    if (swatch) onValueChange(swatch.hue);
  };

  return (
    <RadioGroup
      data-slot="hue-radio-group"
      value={String(value)}
      onValueChange={choose}
      className={cn("grid-cols-[repeat(8,minmax(0,2.5rem))] gap-2", className)}
      {...props}
    >
      {swatches.map(({ hue, label, mark, note }) => {
        const noteId = note ? `${baseId}-${hue}-note` : undefined;

        return (
          <RadioGroupPrimitive.Item
            key={hue}
            value={String(hue)}
            aria-label={label}
            aria-describedby={noteId}
            className={swatchVariants({ tone: hue })}
          >
            <RadioGroupPrimitive.Indicator asChild>
              <CheckIcon aria-hidden className="size-5" />
            </RadioGroupPrimitive.Indicator>
            {mark && (
              <span aria-hidden className="group-data-[state=checked]/swatch:hidden">
                {mark}
              </span>
            )}
            {note && (
              <span id={noteId} className="sr-only">
                {note}
              </span>
            )}
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroup>
  );
}

export { HueRadioGroup };

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { IconButton } from "./icon-button";
import { Input } from "./input";

/**
 * A password field renders a reveal toggle, whose accessible name comes from
 * the caller in the reader's language: the primitive holds no copy of its own.
 */
type RevealToggleLabels =
  | { type: "password"; showPasswordLabel: string; hidePasswordLabel: string }
  | {
      type?: "text" | "email" | "url" | "tel" | "search" | "number" | "date" | "time";
      showPasswordLabel?: never;
      hidePasswordLabel?: never;
    };

type FormTextFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = Omit<ComponentProps<typeof Input>, "name" | "form" | "type"> &
  RevealToggleLabels & {
    control: Control<TFieldValues>;
    name: TName;
    label: string;
    /** Keeps the label for assistive tech only; the placeholder then shows the same words. */
    labelHidden?: boolean;
    description?: string;
  };

export function FormTextField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  label,
  labelHidden = false,
  description,
  type,
  showPasswordLabel,
  hidePasswordLabel,
  ...inputProps
}: FormTextFieldProps<TFieldValues, TName>) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        // FormControl forwards the generated id onto its single child: it has to wrap
        // the input itself, never the reveal-button wrapper, or the label labels a div.
        const input = (
          <FormControl>
            <Input
              type={inputType}
              placeholder={labelHidden ? label : undefined}
              className={isPassword ? "pr-10" : undefined}
              {...inputProps}
              {...field}
            />
          </FormControl>
        );

        return (
          <FormItem>
            <FormLabel className={labelHidden ? "sr-only" : undefined}>{label}</FormLabel>
            {isPassword ? (
              <div className="relative">
                {input}
                <IconButton
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute inset-y-0 right-1 my-auto"
                  onClick={() => setRevealed((value) => !value)}
                  label={revealed ? hidePasswordLabel : showPasswordLabel}
                  tabIndex={-1}
                >
                  {revealed ? <EyeOffIcon /> : <EyeIcon />}
                </IconButton>
              </div>
            ) : (
              input
            )}
            {description ? <FormDescription>{description}</FormDescription> : null}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

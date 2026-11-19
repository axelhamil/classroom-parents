import { type ReactNode, useId } from "react";
import { Field, FieldContent, FieldDescription, FieldLabel } from "./field";
import { Switch } from "./switch";

export interface SwitchFieldProps {
  label: ReactNode;
  /** Says what the current position does, so it changes with `checked`. */
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * A setting applied the moment it is flipped: no save button, the caller
 * persists `onCheckedChange` and shows the pending value while it saves.
 */
export function SwitchField({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SwitchFieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <Field orientation="horizontal">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-describedby={descriptionId}
      />
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

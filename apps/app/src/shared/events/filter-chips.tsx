import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import type { ReactNode } from "react";

const ALL = "all";

export interface FilterChipOption {
  value: string | null;
  label: ReactNode;
}

export interface FilterChipsProps {
  label: string;
  options: readonly FilterChipOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  const current = value ?? ALL;

  const pick = (next: string[]) => {
    const picked = next.find((option) => option !== current);
    if (picked === undefined) return;

    onChange(picked === ALL ? null : picked);
  };

  return (
    <ToggleGroup
      type="multiple"
      variant="chip"
      size="touch"
      spacing={2}
      aria-label={label}
      value={[current]}
      onValueChange={pick}
      className="scrollbar-none max-w-full overflow-x-auto"
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value ?? ALL} value={option.value ?? ALL}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

import { Button } from "@packages/ui/components/ui/button";

export interface FilterChipOption {
  value: string | null;
  label: string;
}

export interface FilterChipsProps {
  label: string;
  options: readonly FilterChipOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  return (
    <fieldset aria-label={label} className="scrollbar-none flex min-w-0 gap-2 overflow-x-auto">
      {options.map((option) => (
        <Button
          key={option.value ?? "all"}
          type="button"
          size="sm"
          variant={option.value === value ? "default" : "outline"}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}

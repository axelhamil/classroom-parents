import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@packages/ui/components/ui/tooltip";
import type { ReactNode } from "react";

const ALL = "all";

export interface FilterChipOption {
  value: string | null;
  label: ReactNode;
  hint?: string;
}

export interface FilterChipsProps {
  label: string;
  options: readonly FilterChipOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  "data-tour"?: string;
}

export function FilterChips({
  label,
  options,
  value,
  onChange,
  "data-tour": tourTarget,
}: FilterChipsProps) {
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
      data-tour={tourTarget}
      value={[current]}
      onValueChange={pick}
      className="scrollbar-none relative max-w-full overflow-x-auto"
    >
      {options.map((option) => {
        const item = (
          <ToggleGroupItem key={option.value ?? ALL} value={option.value ?? ALL}>
            {option.label}
          </ToggleGroupItem>
        );

        return option.hint ? (
          <Tooltip key={option.value ?? ALL}>
            <TooltipTrigger asChild>{item}</TooltipTrigger>
            <TooltipContent>{option.hint}</TooltipContent>
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup>
  );
}

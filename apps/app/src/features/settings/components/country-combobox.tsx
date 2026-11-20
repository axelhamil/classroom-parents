import { Button } from "@packages/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@packages/ui/components/ui/command";
import { PickFromListIcon } from "@packages/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { useState } from "react";
import type { CountryOption } from "../language-and-region";

export interface CountryComboboxProps {
  id: string;
  "aria-describedby"?: string;
  value: string;
  options: readonly CountryOption[];
  onChange: (code: string) => void;
  searchLabel: string;
  emptyLabel: string;
}

/** A searchable country list: about 250 names do not fit a plain select. */
export function CountryCombobox({
  id,
  "aria-describedby": describedBy,
  value,
  options,
  onChange,
  searchLabel,
  emptyLabel,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(({ code }) => code === value);

  const choose = (code: string) => {
    setOpen(false);
    if (code !== value) onChange(code);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-describedby={describedBy}
          className="w-56 justify-between"
        >
          {selected?.name ?? value}
          <PickFromListIcon aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command label={searchLabel}>
          <CommandInput placeholder={searchLabel} aria-label={searchLabel} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map(({ code, name }) => (
                <CommandItem key={code} value={`${name} ${code}`} onSelect={() => choose(code)}>
                  {name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

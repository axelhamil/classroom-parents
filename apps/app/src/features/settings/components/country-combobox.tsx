import { Button } from "@packages/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@packages/ui/components/ui/command";
import { FormControl } from "@packages/ui/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

export interface CountryOption {
  code: string;
  name: string;
}

export interface CountryComboboxProps {
  value: string | null;
  options: readonly CountryOption[];
  onChange: (code: string | null) => void;
  placeholder: string;
  searchLabel: string;
  emptyLabel: string;
  unknownLabel: string;
}

/** A searchable country list; "I don't know" is a choice of its own, at the top. */
export function CountryCombobox({
  value,
  options,
  onChange,
  placeholder,
  searchLabel,
  emptyLabel,
  unknownLabel,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(({ code }) => code === value);

  const choose = (code: string | null) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selected?.name ?? (value === null ? unknownLabel : placeholder)}
            <ChevronsUpDownIcon aria-hidden />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-0">
        <Command label={searchLabel}>
          <CommandInput placeholder={searchLabel} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={unknownLabel} onSelect={() => choose(null)}>
                {unknownLabel}
              </CommandItem>
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

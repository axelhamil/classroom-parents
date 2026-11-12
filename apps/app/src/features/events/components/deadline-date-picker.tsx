import { Button } from "@packages/ui/components/ui/button";
import { Calendar } from "@packages/ui/components/ui/calendar";
import { FormControl } from "@packages/ui/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { dayLabel } from "../../../shared/format/deadline-label";

function localDay(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface DeadlineDatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

export function DeadlineDatePicker({ value, onChange }: DeadlineDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = localDay(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button type="button" variant="outline" className="w-full justify-start">
            <CalendarIcon aria-hidden />
            {dayLabel(value, new Date())}
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(day) => {
            if (!day) return;

            onChange(isoDay(day));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

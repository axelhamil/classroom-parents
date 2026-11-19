import { Button } from "@packages/ui/components/ui/button";
import { Calendar } from "@packages/ui/components/ui/calendar";
import { FormControl } from "@packages/ui/components/ui/form";
import { CalendarIcon } from "@packages/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { useState } from "react";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { dayLabel } from "../../../shared/format/deadline-label";
import { isoDay, localDay } from "../../../shared/format/local-day";

export interface DeadlineDatePickerProps {
  value: string;
  onChange: (date: string) => void;
}

export function DeadlineDatePicker({ value, onChange }: DeadlineDatePickerProps) {
  const [open, setOpen] = useState(false);
  const { today } = useSchoolClock();
  const selected = localDay(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <FormControl>
          <Button type="button" variant="outline" className="w-full justify-start">
            <CalendarIcon aria-hidden />
            {dayLabel(value, today)}
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

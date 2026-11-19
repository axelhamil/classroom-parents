import { Badge } from "@packages/ui/components/ui/badge";
import { Button } from "@packages/ui/components/ui/button";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@packages/ui/components/ui/field";
import { FilterIcon } from "@packages/ui/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@packages/ui/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@packages/ui/components/ui/radio-group";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AgendaCourse } from "../../../../shared/agenda/calendar-days";

const ALL_COURSES = "all";
const MIN_CHOICES = 2;

export interface CourseFilterProps {
  courses: readonly AgendaCourse[];
  courseId: string | null;
  onCourseChange: (courseId: string | null) => void;
}

export function CourseFilter({ courses, courseId, onCourseChange }: CourseFilterProps) {
  const { t } = useTranslation("events");
  const baseId = useId();
  const active = courseId === null ? 0 : 1;
  if (courses.length < MIN_CHOICES && active === 0) return null;

  const options = [{ id: ALL_COURSES, name: t("calendar.filter.allCourses") }, ...courses];

  const choose = (value: string) => onCourseChange(value === ALL_COURSES ? null : value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={
            active > 0
              ? t("calendar.filter.active", { count: active })
              : t("calendar.filter.action")
          }
        >
          <FilterIcon aria-hidden />
          <span className="@max-5xl:sr-only">{t("calendar.filter.action")}</span>
          {active > 0 && <Badge aria-hidden>{active}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <FieldSet>
          <FieldLegend id={`${baseId}-legend`} variant="label">
            {t("calendar.filter.course")}
          </FieldLegend>
          <RadioGroup
            aria-labelledby={`${baseId}-legend`}
            value={courseId ?? ALL_COURSES}
            onValueChange={choose}
            className="max-h-80 overflow-y-auto"
          >
            {options.map((option) => (
              <Field key={option.id} orientation="horizontal">
                <RadioGroupItem value={option.id} id={`${baseId}-${option.id}`} />
                <FieldLabel htmlFor={`${baseId}-${option.id}`}>{option.name}</FieldLabel>
              </Field>
            ))}
          </RadioGroup>
        </FieldSet>
      </PopoverContent>
    </Popover>
  );
}

import frCatalog from "./catalogs/fr";

const LOCALE = "fr-FR";
const copy = frCatalog.common.deadline;

type Placeholders<Template extends string> =
  Template extends `${string}{{${infer Name}}}${infer Rest}` ? Name | Placeholders<Rest> : never;

function fill<Template extends string>(
  template: Template,
  values: Record<Placeholders<Template>, string>,
): string {
  const byName: Record<string, string> = values;

  return template.replace(/{{(\w+)}}/g, (match, name: string) => byName[name] ?? match);
}

export function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function wallTimeLabel(time: string): string {
  const [hours = "0", minutes = "00"] = time.split(":");
  const hour = String(Number(hours));

  return minutes === "00"
    ? fill(copy.hours, { hours: hour })
    : fill(copy.hoursMinutes, { hours: hour, minutes });
}

export function wallDateLabel(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  const format = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });

  return format.format(utcDay(date));
}

export function withWallTime(day: string, time: string | undefined): string {
  if (!time) return day;

  return fill(copy.dateWithTime, { date: day, time: wallTimeLabel(time) });
}

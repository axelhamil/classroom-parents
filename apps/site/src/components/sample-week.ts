const LOCALE = "fr-FR";
const DAY_MS = 86_400_000;

export interface SampleDay {
  date: string;
  day: string;
  month: string;
  weekday: string;
  label: string;
}

export interface SampleDayCopy {
  tomorrow: string;
  dateWithTime: string;
}

export function schoolToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

export function relativeDayLabel(daysAhead: number, time: string, copy: SampleDayCopy): string {
  if (daysAhead !== 1) return time;

  return copy.dateWithTime.replace("{{date}}", copy.tomorrow).replace("{{time}}", time);
}

export function sampleDay(
  today: string,
  daysAhead: number,
  time: string,
  copy: SampleDayCopy,
): SampleDay {
  const instant = Date.parse(`${today}T00:00:00Z`) + daysAhead * DAY_MS;
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(instant);
  const dayLabel =
    daysAhead === 1
      ? copy.tomorrow
      : capitalize(part({ weekday: "long", day: "numeric", month: "long" }));

  return {
    date: new Date(instant).toISOString().slice(0, 10),
    day: part({ day: "numeric" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
    label: copy.dateWithTime.replace("{{date}}", dayLabel).replace("{{time}}", time),
  };
}

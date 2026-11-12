export function localDay(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);

  return new Date(year, month - 1, day);
}

export function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

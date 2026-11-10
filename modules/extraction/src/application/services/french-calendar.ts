export const FRENCH_WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

export const FRENCH_MONTHS = [
  ...["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout"],
  ...["septembre", "octobre", "novembre", "decembre"],
];

export function withoutMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

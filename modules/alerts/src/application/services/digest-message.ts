import type { DigestDeadline } from "../ports/digest-audience.port";

export const DIGEST_TITLE = "Votre semaine";

const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" });

interface ChildCount {
  label: string;
  count: number;
}

function countsByChild(deadlines: DigestDeadline[]): ChildCount[] {
  const counts = new Map<string, ChildCount>();
  for (const { childId, childLabel } of deadlines) {
    const counted = counts.get(childId) ?? { label: childLabel, count: 0 };
    counts.set(childId, { ...counted, count: counted.count + 1 });
  }

  return [...counts.values()];
}

function plural(count: number): string {
  return count > 1 ? "s" : "";
}

export function digestSummary(deadlines: DigestDeadline[]): string {
  const sorted = deadlines.toSorted((a, b) => a.deadlineAt.getTime() - b.deadlineAt.getTime());
  const next = sorted[0];
  if (!next) return "";

  const children = countsByChild(sorted);
  const total = `${sorted.length} échéance${plural(sorted.length)} cette semaine`;
  const split =
    children.length === 1
      ? ` pour ${next.childLabel}.`
      : ` : ${children.map(({ label, count }) => `${count} pour ${label}`).join(", ")}.`;
  const day = weekday.format(new Date(`${next.deadlineDate}T00:00:00Z`));

  return `${total}${split} Prochaine : ${next.title} ${day}.`;
}

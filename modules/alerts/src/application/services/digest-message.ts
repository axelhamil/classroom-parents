import type { DigestDeadline } from "../ports/digest-audience.port";
import type { DigestChildCount, DigestSummary } from "../ports/push-copy.port";

export type DigestDeadlines = [DigestDeadline, ...DigestDeadline[]];

export function hasDeadline(deadlines: DigestDeadline[]): deadlines is DigestDeadlines {
  return deadlines.length > 0;
}

function bySoonest(left: DigestDeadline, right: DigestDeadline): number {
  return left.deadlineAt.getTime() - right.deadlineAt.getTime();
}

function countsByChild(deadlines: DigestDeadline[]): DigestChildCount[] {
  const counts = new Map<string, DigestChildCount>();
  for (const { childId, childLabel } of deadlines) {
    const counted = counts.get(childId) ?? { label: childLabel, count: 0 };
    counts.set(childId, { ...counted, count: counted.count + 1 });
  }

  return [...counts.values()];
}

export function digestSummaryOf(deadlines: DigestDeadlines, today: string): DigestSummary {
  const sorted = deadlines.toSorted(bySoonest);
  const next = sorted[0] ?? deadlines[0];

  return {
    total: deadlines.length,
    children: countsByChild(sorted),
    next: { title: next.title, date: next.deadlineDate },
    today,
  };
}

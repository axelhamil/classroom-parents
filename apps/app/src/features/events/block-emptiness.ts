import type { SchoolClock } from "../../shared/agenda/school-clock";
import {
  childAgendaView,
  type DeadlineKind,
  overdueView,
  progressView,
  reviewView,
  upcomingByKind,
  weekLoadView,
} from "../../shared/agenda/views";
import type { ChildDto } from "../../shared/api/queries/children";
import type { EventItem } from "../../shared/api/queries/events";
import { CHILD_BLOCK_PREFIX } from "./home-block-sizes";

export interface BlockScope {
  events: readonly EventItem[];
  clock: SchoolClock;
  childId: string | null;
}

export interface EmptinessInput {
  events: readonly EventItem[];
  reviewEvents: readonly EventItem[];
  family: readonly ChildDto[];
  clock: SchoolClock;
}

type EmptinessRule = (scope: BlockScope) => boolean;

type EventSource = "events" | "reviewEvents";

const kindIsEmpty =
  (kind: DeadlineKind): EmptinessRule =>
  ({ events, clock, childId }) =>
    upcomingByKind(events, clock, kind, childId).length === 0;

const EMPTINESS: Readonly<Record<string, EmptinessRule>> = {
  review: ({ events, clock }) => reviewView(events, clock).upcoming.length === 0,
  overdue: ({ events, clock, childId }) => overdueView(events, clock, childId).length === 0,
  assessments: kindIsEmpty("assessments"),
  documents: kindIsEmpty("documents"),
  outings: kindIsEmpty("outings"),
  workload: ({ events, clock, childId }) => weekLoadView(events, clock, childId).open.length === 0,
  progress: ({ events, clock, childId }) => progressView(events, clock, childId).total === 0,
};

export function blockIsEmpty(id: string, scope: BlockScope): boolean {
  if (id.startsWith(CHILD_BLOCK_PREFIX)) return childIsFree(id, scope);

  return EMPTINESS[id]?.(scope) ?? false;
}

const SOURCE_OF: Readonly<Record<string, EventSource>> = { review: "reviewEvents" };

export function emptyBlockIds(input: EmptinessInput): ReadonlySet<string> {
  const childBlocks = input.family.map((child) => `${CHILD_BLOCK_PREFIX}${child.id}`);
  const candidates = [...Object.keys(EMPTINESS), ...childBlocks];

  return new Set(candidates.filter((id) => blockIsEmpty(id, scopeOf(id, input))));
}

function scopeOf(id: string, input: EmptinessInput): BlockScope {
  const source = SOURCE_OF[id] ?? "events";

  return { events: input[source], clock: input.clock, childId: null };
}

function childIsFree(id: string, { events, clock }: BlockScope): boolean {
  const childId = id.slice(CHILD_BLOCK_PREFIX.length);

  return childAgendaView(events, clock, childId).due.length === 0;
}

import { Option } from "@packages/ddd-kit";
import type { AgendaEvent } from "../event.aggregate";
import { sameWork } from "./same-work";

function liveCourseworkOfDay(announcement: AgendaEvent, candidate: AgendaEvent): boolean {
  return (
    candidate.get("source").value === "coursework" &&
    candidate.get("deletedAt").isNone() &&
    candidate.get("withdrawnAt").isNone() &&
    candidate.get("childId") === announcement.get("childId") &&
    candidate.get("courseId").isSome() &&
    candidate.get("courseId").equals(announcement.get("courseId")) &&
    candidate.get("deadline").value.date === announcement.get("deadline").value.date
  );
}

export function supersedingCoursework(
  announcement: AgendaEvent,
  sameDay: AgendaEvent[],
): Option<AgendaEvent> {
  const coursework = sameDay.find(
    (candidate) =>
      liveCourseworkOfDay(announcement, candidate) &&
      sameWork(candidate.get("title").value, announcement.get("title").value),
  );

  return Option.fromNullable(coursework);
}

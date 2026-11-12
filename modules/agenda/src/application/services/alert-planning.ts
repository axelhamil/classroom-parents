import { type AppError, Option, Result } from "@packages/ddd-kit";
import type { AgendaEvent } from "../../domain/event.aggregate";
import type { IAlertPlanner } from "../ports/alert-planner.port";
import type { CourseDay, IEventRepository } from "../ports/event-repository.port";
import { plannedDeadline } from "./planned-deadline";

export function courseDayOf(event: AgendaEvent): Option<CourseDay> {
  return event.get("courseId").map((courseId) => ({
    childId: event.get("childId"),
    courseId,
    deadlineDate: event.get("deadline").value.date,
  }));
}

export function dayLeftBy(coursework: AgendaEvent, day: Option<CourseDay>): Option<CourseDay> {
  if (coursework.get("source").value !== "coursework") return Option.none();

  return day.filter(
    (before) =>
      coursework.get("deletedAt").isSome() ||
      coursework.get("withdrawnAt").isSome() ||
      coursework.get("deadline").value.date !== before.deadlineDate,
  );
}

export async function alertAnnouncementsOn(
  events: IEventRepository,
  alerts: IAlertPlanner,
  { userId, day, actorUserId }: { userId: string; day: CourseDay; actorUserId: string | null },
): Promise<Result<void, AppError>> {
  const found = await events.listAnnouncementsOn(userId, day);
  if (found.isFailure) return Result.fail(found.getError());

  for (const announcement of found.getValue()) {
    if (announcement.needsReview() || announcement.get("done")) continue;

    const planned = await alerts.planDefault(plannedDeadline(announcement, actorUserId));
    if (planned.isFailure) return planned;
  }
  return Result.ok();
}

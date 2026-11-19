import { type AppError, type Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { AgendaEvent } from "../../domain/event.aggregate";
import { supersedingCoursework } from "../../domain/services/duplicate-work";
import type { IAlertPlanner } from "../ports/alert-planner.port";
import type { CourseDay, CourseDays, IEventRepository } from "../ports/event-repository.port";
import { plannedDeadline } from "./planned-deadline";

export interface Reconciliation {
  actorUserId: string | null;
  now: Date;
}

export function courseDayOf(event: AgendaEvent): Option<CourseDay> {
  return event.get("courseId").map((courseId) => ({
    childId: event.get("childId"),
    courseId,
    deadlineDate: event.get("deadline").value.date,
  }));
}

export function courseDaysOf(days: CourseDay[]): CourseDays[] {
  const grouped = new Map<string, CourseDays>();
  for (const { childId, courseId, deadlineDate } of days) {
    const key = `${childId}|${courseId}`;
    const group = grouped.get(key) ?? { childId, courseId, dates: [] };
    if (!group.dates.includes(deadlineDate)) group.dates.push(deadlineDate);
    grouped.set(key, group);
  }
  return [...grouped.values()];
}

export class AnnouncementReconciler {
  constructor(
    private readonly events: IEventRepository,
    private readonly alerts: IAlertPlanner,
    private readonly outbox: IOutboxRepository,
  ) {}

  async reconcile(
    userId: string,
    days: CourseDay[],
    reconciliation: Reconciliation,
  ): Promise<Result<void, AppError>> {
    for (const group of courseDaysOf(days)) {
      const reconciled = await this.reconcileCourse(userId, group, reconciliation);
      if (reconciled.isFailure) return reconciled;
    }
    return Result.ok();
  }

  private async reconcileCourse(
    userId: string,
    days: CourseDays,
    reconciliation: Reconciliation,
  ): Promise<Result<void, AppError>> {
    const found = await this.events.lockCourseDays(userId, days);
    if (found.isFailure) return Result.fail(found.getError());

    const sameDays = found.getValue();
    const announcements = sameDays.filter((event) => event.get("source").value === "announcement");
    for (const announcement of announcements) {
      const coursework = supersedingCoursework(announcement, sameDays);
      const applied = coursework.isSome()
        ? await this.supersede(announcement, coursework.unwrap(), reconciliation)
        : await this.restore(announcement, reconciliation);
      if (applied.isFailure) return applied;
    }
    return Result.ok();
  }

  private async supersede(
    announcement: AgendaEvent,
    coursework: AgendaEvent,
    { actorUserId, now }: Reconciliation,
  ): Promise<Result<void, AppError>> {
    const superseded = announcement.supersede(now);
    if (superseded.isFailure || !superseded.getValue()) return Result.ok();

    const saved = await this.events.save(announcement);
    if (saved.isFailure) return saved;

    const cancelled = await this.alerts.cancel(announcement.id.value, actorUserId);
    if (cancelled.isFailure) return cancelled;

    await emitEvent(this.outbox, EventTypes.EVENT_SUPERSEDED, "event", announcement.id.value, {
      userId: announcement.get("userId"),
      childId: announcement.get("childId"),
      eventId: announcement.id.value,
      courseworkEventId: coursework.id.value,
      actorUserId,
    });
    return Result.ok();
  }

  private async restore(
    announcement: AgendaEvent,
    { actorUserId }: Reconciliation,
  ): Promise<Result<void, AppError>> {
    const restored = announcement.restore();
    if (restored.isFailure || !restored.getValue()) return Result.ok();

    const saved = await this.events.save(announcement);
    if (saved.isFailure) return saved;

    if (!announcement.needsReview() && !announcement.get("done")) {
      const planned = await this.alerts.planDefault(plannedDeadline(announcement, actorUserId));
      if (planned.isFailure) return planned;
    }

    await emitEvent(this.outbox, EventTypes.EVENT_UPDATED, "event", announcement.id.value, {
      userId: announcement.get("userId"),
      eventId: announcement.id.value,
      fields: ["withdrawn"],
      actorUserId,
    });
    return Result.ok();
  }
}

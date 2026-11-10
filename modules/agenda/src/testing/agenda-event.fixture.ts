import { Option } from "@packages/ddd-kit";
import { AgendaEvent } from "../domain/event.aggregate";
import { EventId } from "../domain/event-id";
import { EventCategory } from "../domain/value-objects/event-category.vo";
import { EventDeadline } from "../domain/value-objects/event-deadline.vo";
import { EventDescription } from "../domain/value-objects/event-description.vo";
import { EventSource } from "../domain/value-objects/event-source.vo";
import { EventStatus, type EventStatusValue } from "../domain/value-objects/event-status.vo";
import { EventTitle } from "../domain/value-objects/event-title.vo";

export const PARENT = "parent-1";
export const CHILD = "0196a000-0000-7000-8000-000000000001";

export interface AgendaEventOverrides {
  status?: EventStatusValue;
  deadlineDate?: string;
  deadlineTime?: string;
}

export function agendaEvent(overrides: AgendaEventOverrides = {}): AgendaEvent {
  return AgendaEvent.reconstitute(
    {
      userId: PARENT,
      childId: CHILD,
      source: EventSource.announcement(),
      announcementId: "announcement-1",
      ordinal: 0,
      courseId: "course-1",
      announcementUrl: "https://classroom.google.com/c/course-1/p/announcement-1",
      title: EventTitle.create("Contrôle de maths").getValue(),
      description: EventDescription.create("Chapitre 3").getValue(),
      category: EventCategory.create("assessment").getValue(),
      deadline: EventDeadline.fromParisWallTime(
        overrides.deadlineDate ?? "2026-11-19",
        overrides.deadlineTime,
      ).getValue(),
      receivedAt: new Date("2026-11-09T07:00:00.000Z"),
      status: EventStatus.create(overrides.status ?? "confirmed").getValue(),
      done: false,
      editedAt: Option.none(),
      deletedAt: Option.none(),
      createdAt: new Date("2026-11-09T07:05:00.000Z"),
    },
    new EventId(),
  );
}

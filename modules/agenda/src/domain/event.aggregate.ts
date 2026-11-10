import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { EventId } from "./event-id";
import type { EventCategory } from "./value-objects/event-category.vo";
import type { EventDeadline } from "./value-objects/event-deadline.vo";
import type { EventDescription } from "./value-objects/event-description.vo";
import { EventStatus } from "./value-objects/event-status.vo";
import type { EventTitle } from "./value-objects/event-title.vo";

export type EventField = "title" | "description" | "category" | "deadline" | "status";

export type EventRefusal = "deleted";

export interface AgendaEventProps {
  userId: string;
  childId: string;
  announcementId: string;
  ordinal: number;
  courseId: string;
  announcementUrl: string;
  title: EventTitle;
  description: EventDescription;
  category: EventCategory;
  deadline: EventDeadline;
  receivedAt: Date;
  status: EventStatus;
  editedAt: Option<Date>;
  deletedAt: Option<Date>;
  createdAt: Date;
}

export interface NewAgendaEvent {
  userId: string;
  childId: string;
  announcementId: string;
  ordinal: number;
  courseId: string;
  announcementUrl: string;
  title: EventTitle;
  description: EventDescription;
  category: EventCategory;
  deadline: EventDeadline;
  receivedAt: Date;
  needsReview: boolean;
  now: Date;
}

export interface EventChanges {
  title?: EventTitle;
  description?: EventDescription;
  category?: EventCategory;
  deadline?: EventDeadline;
}

export class AgendaEvent extends Aggregate<AgendaEventProps, EventId> {
  private constructor(props: AgendaEventProps, id: EventId) {
    super(props, id);
  }

  static create(input: NewAgendaEvent): AgendaEvent {
    const { needsReview, now, ...props } = input;

    return new AgendaEvent(
      {
        ...props,
        status: EventStatus.of(needsReview),
        editedAt: Option.none(),
        deletedAt: Option.none(),
        createdAt: now,
      },
      new EventId(),
    );
  }

  static reconstitute(props: AgendaEventProps, id: EventId): AgendaEvent {
    return new AgendaEvent(props, id);
  }

  changedFields(changes: EventChanges): EventField[] {
    const fields: EventField[] = [];
    if (changes.title && !changes.title.equals(this._props.title)) fields.push("title");
    if (changes.description && !changes.description.equals(this._props.description))
      fields.push("description");
    if (changes.category && !changes.category.equals(this._props.category)) fields.push("category");
    if (changes.deadline && !changes.deadline.equals(this._props.deadline)) fields.push("deadline");

    return fields;
  }

  needsReview(): boolean {
    return this._props.status.needsReview();
  }

  edit(changes: EventChanges, now: Date): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    this._props.title = changes.title ?? this._props.title;
    this._props.description = changes.description ?? this._props.description;
    this._props.category = changes.category ?? this._props.category;
    this._props.deadline = changes.deadline ?? this._props.deadline;
    this._props.editedAt = Option.some(now);
    return Result.ok();
  }

  confirm(): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    this._props.status = EventStatus.confirmed();
    return Result.ok();
  }

  delete(now: Date): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    this._props.deletedAt = Option.some(now);
    return Result.ok();
  }
}

import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { EventId } from "./event-id";
import type { EventCategory } from "./value-objects/event-category.vo";
import { type ChecklistChange, EventChecklist } from "./value-objects/event-checklist.vo";
import type { EventDeadline } from "./value-objects/event-deadline.vo";
import type { EventDescription } from "./value-objects/event-description.vo";
import { EventSource } from "./value-objects/event-source.vo";
import { EventStatus } from "./value-objects/event-status.vo";
import type { EventTitle } from "./value-objects/event-title.vo";

export const EDITABLE_FIELDS = ["title", "description", "category", "deadline", "done"] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type EventField = EditableField | "status" | "withdrawn" | "checklist";

export type EventRefusal = "deleted" | "withdrawn";

export type ChecklistRefusal = "deleted" | "invalid";

export interface AgendaEventProps {
  userId: string;
  childId: string;
  source: EventSource;
  announcementId: string;
  ordinal: number;
  courseId: Option<string>;
  announcementUrl: Option<string>;
  title: EventTitle;
  description: EventDescription;
  category: EventCategory;
  deadline: EventDeadline;
  receivedAt: Date;
  status: EventStatus;
  done: boolean;
  checklist: EventChecklist;
  editedAt: Option<Date>;
  editedFields: EditableField[];
  deletedAt: Option<Date>;
  withdrawnAt: Option<Date>;
  createdAt: Date;
}

export interface NewAgendaEvent {
  userId: string;
  childId: string;
  source: EventSource;
  announcementId: string;
  ordinal: number;
  courseId: Option<string>;
  announcementUrl: Option<string>;
  title: EventTitle;
  description: EventDescription;
  category: EventCategory;
  deadline: EventDeadline;
  receivedAt: Date;
  needsReview: boolean;
  done: boolean;
  now: Date;
}

export interface ManualEvent {
  userId: string;
  childId: string;
  title: EventTitle;
  description: EventDescription;
  category: EventCategory;
  deadline: EventDeadline;
  now: Date;
}

export interface CourseworkState {
  title: EventTitle;
  deadline: EventDeadline;
  done: boolean;
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
        checklist: EventChecklist.empty(),
        editedAt: Option.none(),
        editedFields: [],
        deletedAt: Option.none(),
        withdrawnAt: Option.none(),
        createdAt: now,
      },
      new EventId(),
    );
  }

  static addByParent({ now, ...input }: ManualEvent): AgendaEvent {
    const id = new EventId();

    return new AgendaEvent(
      {
        ...input,
        source: EventSource.manual(),
        announcementId: id.value,
        ordinal: 0,
        courseId: Option.none(),
        announcementUrl: Option.none(),
        receivedAt: now,
        status: EventStatus.confirmed(),
        done: false,
        checklist: EventChecklist.empty(),
        editedAt: Option.none(),
        editedFields: [],
        deletedAt: Option.none(),
        withdrawnAt: Option.none(),
        createdAt: now,
      },
      id,
    );
  }

  static reconstitute(props: AgendaEventProps, id: EventId): AgendaEvent {
    return new AgendaEvent(props, id);
  }

  changedFields(changes: EventChanges): EditableField[] {
    const fields: EditableField[] = [];
    if (changes.title && !changes.title.equals(this._props.title)) fields.push("title");
    if (changes.description && !changes.description.equals(this._props.description))
      fields.push("description");
    if (changes.category && !changes.category.equals(this._props.category)) fields.push("category");
    if (changes.deadline && !changes.deadline.equals(this._props.deadline)) fields.push("deadline");

    return fields;
  }

  followCoursework(state: CourseworkState): Result<EventField[], EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    const fields: EventField[] = [];
    const edited = this._props.editedFields;
    if (!edited.includes("title") && !state.title.equals(this._props.title)) {
      this._props.title = state.title;
      fields.push("title");
    }
    if (!edited.includes("deadline") && !state.deadline.equals(this._props.deadline)) {
      this._props.deadline = state.deadline;
      fields.push("deadline");
    }
    if (!edited.includes("done") && state.done !== this._props.done) {
      this._props.done = state.done;
      fields.push("done");
    }
    if (this._props.withdrawnAt.isSome()) {
      this._props.withdrawnAt = Option.none();
      fields.push("withdrawn");
    }
    return Result.ok(fields);
  }

  needsReview(): boolean {
    return this._props.status.needsReview();
  }

  edit(changes: EventChanges, now: Date): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    const changed = this.changedFields(changes);
    this._props.editedFields = EDITABLE_FIELDS.filter(
      (field) => this._props.editedFields.includes(field) || changed.includes(field),
    );
    this._props.title = changes.title ?? this._props.title;
    this._props.description = changes.description ?? this._props.description;
    this._props.category = changes.category ?? this._props.category;
    this._props.deadline = changes.deadline ?? this._props.deadline;
    this._props.editedAt = Option.some(now);
    return Result.ok();
  }

  markDone(done: boolean): Result<boolean, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");
    if (done === this._props.done) return Result.ok(false);

    this._props.done = done;
    this._props.editedFields = EDITABLE_FIELDS.filter(
      (field) => field === "done" || this._props.editedFields.includes(field),
    );
    return Result.ok(true);
  }

  changeChecklist(change: ChecklistChange): Result<boolean, ChecklistRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    const next = this._props.checklist.change(change);
    if (next.isFailure) return Result.fail("invalid");
    if (next.getValue().equals(this._props.checklist)) return Result.ok(false);

    this._props.checklist = next.getValue();
    return Result.ok(true);
  }

  confirm(): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    this._props.status = EventStatus.confirmed();
    return Result.ok();
  }

  withdraw(now: Date): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");
    if (this._props.withdrawnAt.isSome()) return Result.fail("withdrawn");

    this._props.withdrawnAt = Option.some(now);
    return Result.ok();
  }

  delete(now: Date): Result<void, EventRefusal> {
    if (this._props.deletedAt.isSome()) return Result.fail("deleted");

    this._props.deletedAt = Option.some(now);
    return Result.ok();
  }
}

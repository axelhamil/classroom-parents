import { z } from "zod";
import type { AgendaEvent, EditableField } from "../../domain/event.aggregate";
import type { EventCategoryValue } from "../../domain/value-objects/event-category.vo";
import type { EventSourceValue } from "../../domain/value-objects/event-source.vo";
import type { EventStatusValue } from "../../domain/value-objects/event-status.vo";

export interface EventDto {
  id: string;
  childId: string;
  title: string;
  description: string;
  category: EventCategoryValue;
  deadlineDate: string;
  deadlineTime?: string;
  deadlineAt: string;
  status: EventStatusValue;
  source: EventSourceValue;
  done: boolean;
  announcementUrl: string;
  receivedAt: string;
  edited: boolean;
  editedFields: EditableField[];
}

export interface EventDeadlineDto {
  childId: string;
  deadlineAt: Date;
  deadlineDate: string;
  deadlineTime?: string;
  done: boolean;
  needsReview: boolean;
}

export interface UpcomingDeadlineDto extends EventDeadlineDto {
  eventId: string;
}

export interface EventPageDto {
  items: EventDto[];
  nextCursor?: string;
}

export const CLEAR_TIME = "clear";

export const eventIdParamSchema = z.object({ id: z.uuid() });

export const editEventBodySchema = z.strictObject({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  deadlineDate: z.string().optional(),
  deadlineTime: z.string().optional(),
});

export type EventPatch = z.infer<typeof editEventBodySchema>;

export function toEventDto(event: AgendaEvent): EventDto {
  const deadline = event.get("deadline").value;

  return {
    id: event.id.value,
    childId: event.get("childId"),
    title: event.get("title").value,
    description: event.get("description").value,
    category: event.get("category").value,
    deadlineDate: deadline.date,
    deadlineTime: deadline.time,
    deadlineAt: deadline.at.toISOString(),
    status: event.get("status").value,
    source: event.get("source").value,
    done: event.get("done"),
    announcementUrl: event.get("announcementUrl"),
    receivedAt: event.get("receivedAt").toISOString(),
    edited: event.get("editedAt").isSome(),
    editedFields: event.get("editedFields"),
  };
}

export function toEventDeadlineDto(event: AgendaEvent): EventDeadlineDto {
  const deadline = event.get("deadline").value;

  return {
    childId: event.get("childId"),
    deadlineAt: deadline.at,
    deadlineDate: deadline.date,
    deadlineTime: deadline.time,
    done: event.get("done"),
    needsReview: event.needsReview(),
  };
}

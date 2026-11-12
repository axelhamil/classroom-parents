import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { AgendaEvent } from "../../domain/event.aggregate";
import type { CalendarRange } from "../../domain/value-objects/calendar-range.vo";
import type { EventCategoryValue } from "../../domain/value-objects/event-category.vo";
import type { EventStatusValue } from "../../domain/value-objects/event-status.vo";

export type AgendaError = AppError<
  | "EVENT_NOT_FOUND"
  | "EVENT_CHILD_NOT_FOUND"
  | "EVENT_DEADLINE_INVALID"
  | "EVENT_TITLE_INVALID"
  | "EVENT_DESCRIPTION_INVALID"
  | "EVENT_CATEGORY_INVALID"
  | "EVENT_RANGE_INVALID"
  | "EVENT_PROVIDER_FAILURE"
>;

export const eventNotFound: AgendaError = {
  code: "EVENT_NOT_FOUND",
  message: "Cet événement n'existe pas ou a été supprimé.",
};

export const childNotFound: AgendaError = {
  code: "EVENT_CHILD_NOT_FOUND",
  message: "Cet enfant n'est pas relié à votre compte, ses événements ne sont pas enregistrés.",
};

export interface EventCursor {
  at: string;
  id: string;
}

export interface EventFilter {
  childIds?: string[];
  categories?: EventCategoryValue[];
  statuses?: EventStatusValue[];
  done?: boolean;
  cursor?: EventCursor;
  limit: number;
}

export interface CalendarFilter {
  childIds?: string[];
  categories?: EventCategoryValue[];
  range: CalendarRange;
}

export interface EventPage {
  events: AgendaEvent[];
  nextCursor: Option<string>;
}

export type CourseworkCourses =
  | { courseId: string }
  | { outsideCourseIds: string[]; dueFrom: Date };

export interface CourseDay {
  childId: string;
  courseId: string;
  deadlineDate: string;
}

export interface IEventRepository {
  insertIfAbsent(event: AgendaEvent): Promise<Result<boolean, AgendaError>>;

  save(event: AgendaEvent): Promise<Result<void, AgendaError>>;

  lockCourseworkItems(
    userId: string,
    childId: string,
    courseworkIds: string[],
  ): Promise<Result<AgendaEvent[], AgendaError>>;

  lockLiveCoursework(
    userId: string,
    childId: string,
    courses: CourseworkCourses,
  ): Promise<Result<AgendaEvent[], AgendaError>>;

  listAnnouncementsOn(userId: string, day: CourseDay): Promise<Result<AgendaEvent[], AgendaError>>;

  listCalendar(userId: string, filter: CalendarFilter): Promise<Result<AgendaEvent[], AgendaError>>;

  findOwned(userId: string, eventId: string): Promise<Result<Option<AgendaEvent>, AgendaError>>;

  lockOwned(userId: string, eventId: string): Promise<Result<Option<AgendaEvent>, AgendaError>>;

  findAlertable(userId: string, eventId: string): Promise<Result<Option<AgendaEvent>, AgendaError>>;

  listAlertableUpcoming(userId: string, now: Date): Promise<Result<AgendaEvent[], AgendaError>>;

  listUpcoming(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPage, AgendaError>>;

  listHistory(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPage, AgendaError>>;
}

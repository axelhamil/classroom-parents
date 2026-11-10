import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { AgendaEvent } from "../../domain/event.aggregate";
import type { EventCategoryValue } from "../../domain/value-objects/event-category.vo";

export type AgendaError = AppError<
  | "EVENT_NOT_FOUND"
  | "EVENT_INVALID_DEADLINE"
  | "EVENT_INVALID_TITLE"
  | "EVENT_INVALID_DESCRIPTION"
  | "EVENT_INVALID_CATEGORY"
  | "EVENT_PROVIDER_FAILURE"
>;

export interface EventCursor {
  at: string;
  id: string;
}

export interface EventFilter {
  childIds?: string[];
  categories?: EventCategoryValue[];
  cursor?: EventCursor;
  limit: number;
}

export interface EventPage {
  events: AgendaEvent[];
  nextCursor: Option<string>;
}

export interface IEventRepository {
  insertIfAbsent(event: AgendaEvent): Promise<Result<boolean, AgendaError>>;

  save(event: AgendaEvent): Promise<Result<void, AgendaError>>;

  findOwned(userId: string, eventId: string): Promise<Result<Option<AgendaEvent>, AgendaError>>;

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

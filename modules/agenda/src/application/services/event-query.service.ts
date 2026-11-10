import { type IInstrumentation, type Option, type Result, traced } from "@packages/ddd-kit";
import {
  type EventDeadlineDto,
  type EventDto,
  type EventPageDto,
  toEventDeadlineDto,
  toEventDto,
} from "../dto/event.dto";
import type {
  AgendaError,
  EventFilter,
  EventPage,
  IEventRepository,
} from "../ports/event-repository.port";

function toPageDto(page: EventPage): EventPageDto {
  return { items: page.events.map(toEventDto), nextCursor: page.nextCursor.toUndefined() };
}

export class EventQueryService {
  constructor(
    private readonly events: IEventRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listUpcoming(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPageDto, AgendaError>> {
    return traced(this.instrumentation, "EventQueryService > listUpcoming", async () =>
      (await this.events.listUpcoming(userId, filter, now)).map(toPageDto),
    );
  }

  async listHistory(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPageDto, AgendaError>> {
    return traced(this.instrumentation, "EventQueryService > listHistory", async () =>
      (await this.events.listHistory(userId, filter, now)).map(toPageDto),
    );
  }

  async get(userId: string, eventId: string): Promise<Result<Option<EventDto>, AgendaError>> {
    return traced(this.instrumentation, "EventQueryService > get", async () =>
      (await this.events.findOwned(userId, eventId)).map((found) => found.map(toEventDto)),
    );
  }

  async alertDeadline(
    userId: string,
    eventId: string,
  ): Promise<Result<Option<EventDeadlineDto>, AgendaError>> {
    return traced(this.instrumentation, "EventQueryService > alertDeadline", async () =>
      (await this.events.findAlertable(userId, eventId)).map((found) =>
        found.map(toEventDeadlineDto),
      ),
    );
  }
}

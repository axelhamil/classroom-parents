import type { IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { type EventDto, type EventPageDto, toEventDto } from "../dto/event.dto";
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
    return this.span("listUpcoming", async () =>
      (await this.events.listUpcoming(userId, filter, now)).map(toPageDto),
    );
  }

  async listHistory(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPageDto, AgendaError>> {
    return this.span("listHistory", async () =>
      (await this.events.listHistory(userId, filter, now)).map(toPageDto),
    );
  }

  async get(userId: string, eventId: string): Promise<Result<Option<EventDto>, AgendaError>> {
    return this.span("get", async () =>
      (await this.events.findOwned(userId, eventId)).map((found) => found.map(toEventDto)),
    );
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `EventQueryService > ${method}`, op: "function" },
      work,
    );
  }
}

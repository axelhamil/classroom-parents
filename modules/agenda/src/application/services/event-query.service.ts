import { type AppError, type IInstrumentation, Option, Result, traced } from "@packages/ddd-kit";
import {
  type EventDeadlineDto,
  type EventDto,
  type EventPageDto,
  toEventDeadlineDto,
  toEventDto,
  type UpcomingDeadlineDto,
} from "../dto/event.dto";
import type {
  AgendaError,
  EventFilter,
  EventPage,
  IEventRepository,
} from "../ports/event-repository.port";
import type { IVisibleChildren } from "../ports/visible-children.port";
import { visibleEvent } from "./visible-event";

type ListError = AgendaError | AppError;
type PageReader = (filter: EventFilter) => Promise<Result<EventPage, AgendaError>>;

const emptyPage: EventPageDto = { items: [], nextCursor: undefined };

function toPageDto(page: EventPage): EventPageDto {
  return { items: page.events.map(toEventDto), nextCursor: page.nextCursor.toUndefined() };
}

export class EventQueryService {
  constructor(
    private readonly events: IEventRepository,
    private readonly children: IVisibleChildren,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async listUpcoming(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPageDto, ListError>> {
    return traced(this.instrumentation, "EventQueryService > listUpcoming", () =>
      this.listVisible(userId, { ...filter, done: filter.done ?? false }, (visible) =>
        this.events.listUpcoming(userId, visible, now),
      ),
    );
  }

  async listHistory(
    userId: string,
    filter: EventFilter,
    now: Date,
  ): Promise<Result<EventPageDto, ListError>> {
    return traced(this.instrumentation, "EventQueryService > listHistory", () =>
      this.listVisible(userId, filter, (visible) => this.events.listHistory(userId, visible, now)),
    );
  }

  async get(userId: string, eventId: string): Promise<Result<Option<EventDto>, ListError>> {
    return traced(this.instrumentation, "EventQueryService > get", async () => {
      const found = await this.events.findOwned(userId, eventId);
      if (found.isFailure) return Result.fail(found.getError());

      return (await visibleEvent(this.children, userId, found.getValue())).map((visible) =>
        visible.map(toEventDto),
      );
    });
  }

  async alertableUpcoming(
    userId: string,
    now: Date,
  ): Promise<Result<UpcomingDeadlineDto[], AgendaError>> {
    return traced(this.instrumentation, "EventQueryService > alertableUpcoming", async () =>
      (await this.events.listAlertableUpcoming(userId, now)).map((events) =>
        events.map((event) => ({ eventId: event.id.value, ...toEventDeadlineDto(event) })),
      ),
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

  private async listVisible(
    userId: string,
    filter: EventFilter,
    read: PageReader,
  ): Promise<Result<EventPageDto, ListError>> {
    const visible = await this.visibleFilter(userId, filter);
    if (visible.isFailure) return Result.fail(visible.getError());
    if (visible.getValue().isNone()) return Result.ok(emptyPage);

    return (await read(visible.getValue().unwrap())).map(toPageDto);
  }

  private async visibleFilter(
    userId: string,
    filter: EventFilter,
  ): Promise<Result<Option<EventFilter>, AppError>> {
    const ids = await this.children.idsOf(userId);
    if (ids.isFailure) return Result.fail(ids.getError());

    const visible = ids.getValue();
    const childIds = filter.childIds
      ? filter.childIds.filter((id) => visible.includes(id))
      : visible;
    if (childIds.length === 0) return Result.ok(Option.none());

    return Result.ok(Option.some({ ...filter, childIds }));
  }
}

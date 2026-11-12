import { type AppError, type IInstrumentation, Option, Result, traced } from "@packages/ddd-kit";
import type { EventCategoryValue } from "../../domain/value-objects/event-category.vo";
import {
  type EventDeadlineDto,
  type EventDto,
  type EventListDto,
  type EventPageDto,
  type TitledDeadlineDto,
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
import { parseRange } from "./event-fields";
import { visibleEvent } from "./visible-event";

type ListError = AgendaError | AppError;
export interface ConfirmedSinceRequest {
  childIds?: string[];
  since: Date;
  now: Date;
  limit: number;
}

type PageReader = (filter: EventFilter) => Promise<Result<EventPage, AgendaError>>;

export interface CalendarQuery {
  from: string;
  to: string;
  childIds?: string[];
  categories?: EventCategoryValue[];
}

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

  async listCalendar(
    userId: string,
    { from, to, ...filter }: CalendarQuery,
  ): Promise<Result<EventListDto, ListError>> {
    return traced(this.instrumentation, "EventQueryService > listCalendar", async () => {
      const range = parseRange(from, to);
      if (range.isFailure) return Result.fail(range.getError());

      const visible = await this.visibleFilter(userId, filter);
      if (visible.isFailure) return Result.fail(visible.getError());
      if (visible.getValue().isNone()) return Result.ok({ items: [] });

      const calendar = { ...visible.getValue().unwrap(), range: range.getValue() };
      return (await this.events.listCalendar(userId, calendar)).map((events) => ({
        items: events.map(toEventDto),
      }));
    });
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

  async alertableWithin(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<Result<TitledDeadlineDto[], AgendaError>> {
    return traced(this.instrumentation, "EventQueryService > alertableWithin", async () =>
      (await this.events.listAlertableUpcoming(userId, from, to)).map((events) =>
        events.map((event) => ({
          eventId: event.id.value,
          title: event.get("title").value,
          ...toEventDeadlineDto(event),
        })),
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

  async confirmedSince(
    userId: string,
    request: ConfirmedSinceRequest,
  ): Promise<Result<EventDto[], ListError>> {
    return traced(this.instrumentation, "EventQueryService > confirmedSince", async () => {
      const visible = await this.visibleFilter(userId, {
        childIds: request.childIds,
        limit: request.limit,
      });
      if (visible.isFailure) return Result.fail(visible.getError());
      if (visible.getValue().isNone()) return Result.ok([]);

      const childIds = visible.getValue().unwrap().childIds ?? [];
      return (
        await this.events.listConfirmedSince(
          userId,
          childIds,
          { since: request.since, now: request.now },
          request.limit,
        )
      ).map((events) => events.map(toEventDto));
    });
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

  private async visibleFilter<F extends { childIds?: string[] }>(
    userId: string,
    filter: F,
  ): Promise<Result<Option<F>, AppError>> {
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

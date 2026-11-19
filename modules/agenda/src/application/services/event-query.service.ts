import { type AppError, type IInstrumentation, Option, Result, traced } from "@packages/ddd-kit";
import type { EventCategoryValue } from "../../domain/value-objects/event-category.vo";
import {
  type EventDeadlineDto,
  type EventDto,
  type EventListDto,
  type EventPageDto,
  type TitledDeadlineDto,
  toEventDeadlineDto,
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
import type { EventPresenter } from "./event-presenter";
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

export class EventQueryService {
  constructor(
    private readonly events: IEventRepository,
    private readonly children: IVisibleChildren,
    private readonly presenter: EventPresenter,
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
      const events = await this.events.listCalendar(userId, calendar);
      if (events.isFailure) return Result.fail(events.getError());

      return Result.ok({ items: await this.presenter.present(events.getValue()) });
    });
  }

  async get(userId: string, eventId: string): Promise<Result<Option<EventDto>, ListError>> {
    return traced(this.instrumentation, "EventQueryService > get", async () => {
      const found = await this.events.findOwned(userId, eventId);
      if (found.isFailure) return Result.fail(found.getError());

      const visible = await visibleEvent(this.children, userId, found.getValue());
      if (visible.isFailure) return Result.fail(visible.getError());
      if (visible.getValue().isNone()) return Result.ok(Option.none());

      return Result.ok(Option.some(await this.presenter.presentOne(visible.getValue().unwrap())));
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
      const events = await this.events.listConfirmedSince(
        userId,
        childIds,
        { since: request.since, now: request.now },
        request.limit,
      );
      if (events.isFailure) return Result.fail(events.getError());

      return Result.ok(await this.presenter.present(events.getValue()));
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

    const page = await read(visible.getValue().unwrap());
    if (page.isFailure) return Result.fail(page.getError());

    return Result.ok(await this.toPageDto(page.getValue()));
  }

  private async toPageDto({ events, nextCursor }: EventPage): Promise<EventPageDto> {
    return { items: await this.presenter.present(events), nextCursor: nextCursor.toUndefined() };
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

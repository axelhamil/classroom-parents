import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  type Option,
  Result,
  traced,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  AgendaEvent,
  type EventChanges,
  type EventField,
  type ManualEvent,
} from "../../domain/event.aggregate";
import {
  CLEAR_TIME,
  type EventDto,
  type EventPatch,
  type NewEventBody,
  toEventDto,
} from "../dto/event.dto";
import type { IAlertPlanner } from "../ports/alert-planner.port";
import {
  type AgendaError,
  type CourseDay,
  childNotFound,
  eventNotFound,
  type IEventRepository,
} from "../ports/event-repository.port";
import type { IVisibleChildren } from "../ports/visible-children.port";
import { alertAnnouncementsOn, courseDayOf, dayLeftBy } from "./alert-planning";
import { parseCategory, parseDeadline, parseDescription, parseTitle } from "./event-fields";
import { plannedDeadline } from "./planned-deadline";
import { visibleEvent } from "./visible-event";

type EditError = AgendaError | AppError;

export class EventEditService {
  constructor(
    private readonly events: IEventRepository,
    private readonly children: IVisibleChildren,
    private readonly alerts: IAlertPlanner,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async add(userId: string, body: NewEventBody): Promise<Result<EventDto, EditError>> {
    return traced(this.instrumentation, "EventEditService > add", () =>
      this.transactions.run(async () => {
        const visible = await this.children.idsOf(userId);
        if (visible.isFailure) return Result.fail(visible.getError());
        if (!visible.getValue().includes(body.childId)) return Result.fail(childNotFound);

        const fields = this.manualFrom(userId, body);
        if (fields.isFailure) return Result.fail(fields.getError());

        const event = AgendaEvent.addByParent(fields.getValue());
        const inserted = await this.events.insertIfAbsent(event);
        if (inserted.isFailure) return Result.fail(inserted.getError());

        const planned = await this.alerts.planDefault(plannedDeadline(event, userId));
        if (planned.isFailure) return Result.fail(planned.getError());

        await emitEvent(this.outbox, EventTypes.EVENT_ADDED, "event", event.id.value, {
          userId,
          childId: body.childId,
          eventId: event.id.value,
          actorUserId: userId,
        });
        return Result.ok(toEventDto(event));
      }),
    );
  }

  async edit(
    userId: string,
    eventId: string,
    patch: EventPatch,
  ): Promise<Result<EventDto, EditError>> {
    return traced(this.instrumentation, "EventEditService > edit", () =>
      this.transactions.run(async () => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();

        const changes = this.changesFrom(event, patch);
        if (changes.isFailure) return Result.fail(changes.getError());

        const fields = event.changedFields(changes.getValue());
        if (fields.length === 0) return Result.ok(toEventDto(event));

        const day = courseDayOf(event);
        if (event.edit(changes.getValue(), this.clock()).isFailure)
          return Result.fail(eventNotFound);
        const saved = await this.events.save(event);
        if (saved.isFailure) return Result.fail(saved.getError());

        if (fields.includes("deadline")) {
          const replanned = await this.alerts.replan(plannedDeadline(event, userId));
          if (replanned.isFailure) return Result.fail(replanned.getError());
        }
        const unmasked = await this.unmask(event, day, userId);
        if (unmasked.isFailure) return Result.fail(unmasked.getError());

        await this.emitUpdated(event, fields);
        return Result.ok(toEventDto(event));
      }),
    );
  }

  async confirm(userId: string, eventId: string): Promise<Result<EventDto, EditError>> {
    return traced(this.instrumentation, "EventEditService > confirm", () =>
      this.transactions.run(async () => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();
        if (!event.needsReview()) return Result.ok(toEventDto(event));

        if (event.confirm().isFailure) return Result.fail(eventNotFound);
        const saved = await this.events.save(event);
        if (saved.isFailure) return Result.fail(saved.getError());

        const planned = await this.alerts.planDefault(plannedDeadline(event, userId));
        if (planned.isFailure) return Result.fail(planned.getError());

        await this.emitUpdated(event, ["status"]);
        return Result.ok(toEventDto(event));
      }),
    );
  }

  async markDone(
    userId: string,
    eventId: string,
    done: boolean,
  ): Promise<Result<EventDto, EditError>> {
    return traced(this.instrumentation, "EventEditService > markDone", () =>
      this.transactions.run(async () => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();

        const marked = event.markDone(done);
        if (marked.isFailure) return Result.fail(eventNotFound);
        if (!marked.getValue()) return Result.ok(toEventDto(event));

        const saved = await this.events.save(event);
        if (saved.isFailure) return Result.fail(saved.getError());

        const replanned = await this.alerts.replan(plannedDeadline(event, userId));
        if (replanned.isFailure) return Result.fail(replanned.getError());

        await this.emitUpdated(event, ["done"]);
        return Result.ok(toEventDto(event));
      }),
    );
  }

  async remove(userId: string, eventId: string): Promise<Result<void, EditError>> {
    return traced(this.instrumentation, "EventEditService > remove", () =>
      this.transactions.run(async (): Promise<Result<void, EditError>> => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();

        const day = courseDayOf(event);
        if (event.delete(this.clock()).isFailure) return Result.fail(eventNotFound);
        const saved = await this.events.save(event);
        if (saved.isFailure) return saved;

        const cancelled = await this.alerts.cancel(eventId, userId);
        if (cancelled.isFailure) return cancelled;

        const unmasked = await this.unmask(event, day, userId);
        if (unmasked.isFailure) return unmasked;

        await emitEvent(this.outbox, EventTypes.EVENT_DELETED, "event", eventId, {
          userId,
          eventId,
        });
        return Result.ok();
      }),
    );
  }

  private async unmask(
    event: AgendaEvent,
    day: Option<CourseDay>,
    userId: string,
  ): Promise<Result<void, AppError>> {
    const left = dayLeftBy(event, day);
    if (left.isNone()) return Result.ok();

    return alertAnnouncementsOn(this.events, this.alerts, {
      userId,
      day: left.unwrap(),
      actorUserId: userId,
    });
  }

  private async owned(userId: string, eventId: string): Promise<Result<AgendaEvent, EditError>> {
    const found = await this.events.lockOwned(userId, eventId);
    if (found.isFailure) return Result.fail(found.getError());

    const visible = await visibleEvent(this.children, userId, found.getValue());
    if (visible.isFailure) return Result.fail(visible.getError());

    return visible.getValue().toResult(eventNotFound);
  }

  private manualFrom(userId: string, body: NewEventBody): Result<ManualEvent, AgendaError> {
    const title = parseTitle(body.title);
    if (title.isFailure) return Result.fail(title.getError());
    const description = parseDescription(body.description ?? "");
    if (description.isFailure) return Result.fail(description.getError());
    const category = parseCategory(body.category);
    if (category.isFailure) return Result.fail(category.getError());
    const deadline = parseDeadline(body.deadlineDate, body.deadlineTime);
    if (deadline.isFailure) return Result.fail(deadline.getError());

    return Result.ok({
      userId,
      childId: body.childId,
      title: title.getValue(),
      description: description.getValue(),
      category: category.getValue(),
      deadline: deadline.getValue(),
      now: this.clock(),
    });
  }

  private changesFrom(event: AgendaEvent, patch: EventPatch): Result<EventChanges, AgendaError> {
    const changes: EventChanges = {};
    if (patch.title !== undefined) {
      const title = parseTitle(patch.title);
      if (title.isFailure) return Result.fail(title.getError());
      changes.title = title.getValue();
    }
    if (patch.description !== undefined) {
      const description = parseDescription(patch.description);
      if (description.isFailure) return Result.fail(description.getError());
      changes.description = description.getValue();
    }
    if (patch.category !== undefined) {
      const category = parseCategory(patch.category);
      if (category.isFailure) return Result.fail(category.getError());
      changes.category = category.getValue();
    }
    if (patch.deadlineDate === undefined && patch.deadlineTime === undefined)
      return Result.ok(changes);

    const current = event.get("deadline").value;
    const time =
      patch.deadlineTime === CLEAR_TIME ? undefined : (patch.deadlineTime ?? current.time);
    const deadline = parseDeadline(patch.deadlineDate ?? current.date, time);
    if (deadline.isFailure) return Result.fail(deadline.getError());
    changes.deadline = deadline.getValue();
    return Result.ok(changes);
  }

  private async emitUpdated(event: AgendaEvent, fields: EventField[]): Promise<void> {
    await emitEvent(this.outbox, EventTypes.EVENT_UPDATED, "event", event.id.value, {
      userId: event.get("userId"),
      eventId: event.id.value,
      fields,
      actorUserId: event.get("userId"),
    });
  }
}

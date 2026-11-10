import { type AppError, type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { AgendaEvent, EventChanges, EventField } from "../../domain/event.aggregate";
import { CLEAR_TIME, type EventDto, type EventPatch, toEventDto } from "../dto/event.dto";
import type { IAlertPlanner, PlannedDeadline } from "../ports/alert-planner.port";
import type { AgendaError, IEventRepository } from "../ports/event-repository.port";
import {
  eventNotFound,
  parseCategory,
  parseDeadline,
  parseDescription,
  parseTitle,
} from "./event-fields";

type EditError = AgendaError | AppError;

function plannedDeadline(event: AgendaEvent): PlannedDeadline {
  const deadline = event.get("deadline").value;

  return {
    eventId: event.id.value,
    userId: event.get("userId"),
    deadlineDate: deadline.date,
    deadlineTime: deadline.time,
  };
}

export class EventEditService {
  constructor(
    private readonly events: IEventRepository,
    private readonly alerts: IAlertPlanner,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async edit(
    userId: string,
    eventId: string,
    patch: EventPatch,
  ): Promise<Result<EventDto, EditError>> {
    return this.span("edit", () =>
      this.transactions.run(async () => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();

        const changes = this.changesFrom(event, patch);
        if (changes.isFailure) return Result.fail(changes.getError());

        const fields = event.changedFields(changes.getValue());
        if (fields.length === 0) return Result.ok(toEventDto(event));

        if (event.edit(changes.getValue(), this.clock()).isFailure)
          return Result.fail(eventNotFound);
        const saved = await this.events.save(event);
        if (saved.isFailure) return Result.fail(saved.getError());

        if (fields.includes("deadline") && !event.needsReview()) {
          const replanned = await this.alerts.replan(plannedDeadline(event));
          if (replanned.isFailure) return Result.fail(replanned.getError());
        }

        await this.emitUpdated(event, fields);
        return Result.ok(toEventDto(event));
      }),
    );
  }

  async confirm(userId: string, eventId: string): Promise<Result<EventDto, EditError>> {
    return this.span("confirm", () =>
      this.transactions.run(async () => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();
        if (!event.needsReview()) return Result.ok(toEventDto(event));

        if (event.confirm().isFailure) return Result.fail(eventNotFound);
        const saved = await this.events.save(event);
        if (saved.isFailure) return Result.fail(saved.getError());

        const planned = await this.alerts.planDefault(plannedDeadline(event));
        if (planned.isFailure) return Result.fail(planned.getError());

        await this.emitUpdated(event, ["status"]);
        return Result.ok(toEventDto(event));
      }),
    );
  }

  async remove(userId: string, eventId: string): Promise<Result<void, EditError>> {
    return this.span("remove", () =>
      this.transactions.run(async (): Promise<Result<void, EditError>> => {
        const found = await this.owned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        const event = found.getValue();

        if (event.delete(this.clock()).isFailure) return Result.fail(eventNotFound);
        const saved = await this.events.save(event);
        if (saved.isFailure) return saved;

        const cancelled = await this.alerts.cancel(eventId);
        if (cancelled.isFailure) return cancelled;

        await emitEvent(this.outbox, EventTypes.EVENT_DELETED, "event", eventId, {
          userId,
          eventId,
        });
        return Result.ok();
      }),
    );
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `EventEditService > ${method}`, op: "function" },
      work,
    );
  }

  private async owned(userId: string, eventId: string): Promise<Result<AgendaEvent, AgendaError>> {
    const found = await this.events.findOwned(userId, eventId);
    if (found.isFailure) return Result.fail(found.getError());

    return found.getValue().toResult(eventNotFound);
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
    });
  }
}

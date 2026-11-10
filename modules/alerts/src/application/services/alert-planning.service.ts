import { type AppError, type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { type BatchedEvent, emitEvents } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { Alert } from "../../domain/alert.aggregate";
import { AlertOrigin } from "../../domain/value-objects/alert-origin.vo";
import type { AlertsError, IAlertRepository } from "../ports/alert-repository.port";
import type {
  EventDeadline,
  IEventDeadlines,
  UpcomingDeadline,
} from "../ports/event-deadlines.port";
import type { IReminderSettingsRepository } from "../ports/reminder-settings.port";
import {
  type ApplicableReminders,
  applicableReminders,
  fromDefaults,
  fromEventPlan,
  reminderTarget,
} from "./applicable-reminders";

export interface PlannedEvent {
  eventId: string;
  userId: string;
  actorUserId: string | null;
}

interface Occurrence {
  pending: boolean;
  version: number;
}

interface Changes {
  alerts: Alert[];
  events: BatchedEvent<unknown>[];
}

const NO_OCCURRENCE: Occurrence = { pending: false, version: 0 };

function occurrenceOf(alert: Alert): Occurrence {
  return { pending: alert.isPending(), version: alert.get("version") };
}

function noChanges(): Changes {
  return { alerts: [], events: [] };
}

function corrupted(error: string): AlertsError {
  return { code: "ALERT_PROVIDER_FAILURE", message: `alert planning failed: ${error}` };
}

export class AlertPlanningService {
  constructor(
    private readonly alerts: IAlertRepository,
    private readonly settings: IReminderSettingsRepository,
    private readonly deadlines: IEventDeadlines,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async planDefault(event: PlannedEvent): Promise<Result<void, AppError>> {
    return this.span("planDefault", () => this.follow(event));
  }

  async replan(event: PlannedEvent): Promise<Result<void, AppError>> {
    return this.span("replan", () => this.follow(event));
  }

  async replanUpcoming(
    userId: string,
    upcoming: UpcomingDeadline[],
    actorUserId: string | null,
  ): Promise<Result<void, AppError>> {
    return this.span("replanUpcoming", () =>
      this.transactions.run(async (): Promise<Result<void, AppError>> => {
        if (upcoming.length === 0) return Result.ok();
        const eventIds = upcoming.map(({ eventId }) => eventId);

        const defaults = await this.settings.defaultsFor(userId);
        if (defaults.isFailure) return Result.fail(defaults.getError());
        const plans = await this.settings.eventPlansFor(userId, eventIds);
        if (plans.isFailure) return Result.fail(plans.getError());
        const found = await this.alerts.lockOwnedMany(userId, eventIds);
        if (found.isFailure) return Result.fail(found.getError());

        const changes = noChanges();
        const now = this.clock();
        for (const deadline of upcoming) {
          const own = plans.getValue().get(deadline.eventId);
          const planned = this.plan(
            changes,
            { eventId: deadline.eventId, userId, actorUserId },
            deadline,
            own ? fromEventPlan(own) : fromDefaults(defaults.getValue()),
            found.getValue().filter((alert) => alert.get("eventId") === deadline.eventId),
            now,
          );
          if (planned.isFailure) return planned;
        }
        return this.write(changes);
      }),
    );
  }

  async cancel(eventId: string, actorUserId: string | null): Promise<Result<void, AppError>> {
    return this.span("cancel", () =>
      this.transactions.run(async (): Promise<Result<void, AppError>> => {
        const found = await this.alerts.lockByEvent(eventId);
        if (found.isFailure) return Result.fail(found.getError());

        const changes = noChanges();
        this.cancelAll(changes, found.getValue(), actorUserId);
        return this.write(changes);
      }),
    );
  }

  private async follow(event: PlannedEvent): Promise<Result<void, AppError>> {
    return this.transactions.run(async (): Promise<Result<void, AppError>> => {
      const deadline = await this.deadlines.forUser(event.userId, event.eventId);
      if (deadline.isFailure) return Result.fail(deadline.getError());

      const found = await this.alerts.lockOwned(event.userId, event.eventId);
      if (found.isFailure) return Result.fail(found.getError());
      const changes = noChanges();
      if (deadline.getValue().isNone() || deadline.getValue().unwrap().done) {
        this.cancelAll(changes, found.getValue(), event.actorUserId);
        return this.write(changes);
      }

      const applicable = await applicableReminders(this.settings, event.userId, event.eventId);
      if (applicable.isFailure) return Result.fail(applicable.getError());

      const planned = this.plan(
        changes,
        event,
        deadline.getValue().unwrap(),
        applicable.getValue(),
        found.getValue(),
        this.clock(),
      );
      if (planned.isFailure) return planned;
      return this.write(changes);
    });
  }

  private plan(
    changes: Changes,
    event: PlannedEvent,
    deadline: EventDeadline,
    { reminders, origin }: ApplicableReminders,
    existing: Alert[],
    now: Date,
  ): Result<void, AlertsError> {
    if (deadline.done || (deadline.needsReview && origin.equals(AlertOrigin.byDefault()))) {
      this.cancelAll(changes, existing, event.actorUserId);
      return Result.ok();
    }

    const target = reminderTarget(deadline);
    const planned = reminders.plan(target);
    if (planned.isFailure) return Result.fail(corrupted(planned.getError()));

    const kept = new Set(planned.getValue().map(({ reminder }) => reminder.key()));
    this.cancelAll(
      changes,
      existing.filter((alert) => !kept.has(alert.key())),
      event.actorUserId,
    );

    for (const { reminder, time } of planned.getValue()) {
      const alert = existing.find((candidate) => candidate.key() === reminder.key());
      if (alert) {
        const before = occurrenceOf(alert);
        alert.follow({ time, origin }, target, now);
        this.record(changes, alert, before, event.actorUserId);
        continue;
      }

      const scheduled = Alert.schedule({ ...event, reminder, time, origin, deadline: target, now });
      if (scheduled.isPending()) this.record(changes, scheduled, NO_OCCURRENCE, event.actorUserId);
    }
    return Result.ok();
  }

  private cancelAll(changes: Changes, alerts: Alert[], actorUserId: string | null): void {
    for (const alert of alerts.filter((candidate) => candidate.isPending())) {
      alert.cancel();
      changes.alerts.push(alert);
      changes.events.push({
        eventType: EventTypes.ALERT_CANCELLED,
        aggregateId: alert.id.value,
        payload: {
          userId: alert.get("userId"),
          alertId: alert.id.value,
          eventId: alert.get("eventId"),
          actorUserId,
        },
      });
    }
  }

  private record(
    changes: Changes,
    alert: Alert,
    before: Occurrence,
    actorUserId: string | null,
  ): void {
    changes.alerts.push(alert);

    const ids = { userId: alert.get("userId"), alertId: alert.id.value };
    if (alert.isPending() && alert.get("version") !== before.version)
      changes.events.push({
        eventType: EventTypes.ALERT_SCHEDULED,
        aggregateId: alert.id.value,
        payload: {
          ...ids,
          eventId: alert.get("eventId"),
          reminder: alert.key(),
          dueAt: alert.get("time").value.at.toISOString(),
          origin: alert.get("origin").value,
          actorUserId,
        },
      });
    if (before.pending && !alert.isPending())
      changes.events.push({
        eventType: EventTypes.ALERT_SKIPPED,
        aggregateId: alert.id.value,
        payload: { ...ids, actorUserId },
      });
  }

  private async write(changes: Changes): Promise<Result<void, AppError>> {
    if (changes.alerts.length > 0) {
      const saved = await this.alerts.saveMany(changes.alerts);
      if (saved.isFailure) return saved;
    }
    await emitEvents(this.outbox, "alert", changes.events);
    return Result.ok();
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `AlertPlanningService > ${method}`, op: "function" },
      work,
    );
  }
}

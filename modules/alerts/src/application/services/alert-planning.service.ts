import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  type Option,
  Result,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { Alert, type AlertDeadline } from "../../domain/alert.aggregate";
import { AlertTime } from "../../domain/value-objects/alert-time.vo";
import { type AlertDto, toAlertDto, type UserAlertTime } from "../dto/alert.dto";
import {
  type AlertsError,
  alertNotFound,
  type IAlertRepository,
} from "../ports/alert-repository.port";
import type { EventDeadline, IEventDeadlines } from "../ports/event-deadlines.port";

export interface PlannedEvent {
  eventId: string;
  userId: string;
  actorUserId: string | null;
}

interface Occurrence {
  pending: boolean;
  version: number;
}

const NO_OCCURRENCE: Occurrence = { pending: false, version: 0 };

function occurrenceOf(alert: Alert): Occurrence {
  return { pending: alert.isPending(), version: alert.get("version") };
}

type PlanningError = AlertsError | AppError;

const timeInvalid: AlertsError = {
  code: "ALERT_TIME_INVALID",
  message: "Cette date ou cette heure n'existe pas. Choisissez un jour et une heure valides.",
};

const timeInPast: AlertsError = {
  code: "ALERT_IN_PAST",
  message: "Cette heure est déjà passée. Choisissez un moment à venir pour l'alerte.",
};

const timeAfterDeadline: AlertsError = {
  code: "ALERT_AFTER_DEADLINE",
  message: "L'alerte doit sonner avant l'échéance. Choisissez un moment plus tôt.",
};

const eventDone: AlertsError = {
  code: "ALERT_EVENT_DONE_CONFLICT",
  message: "Cette échéance est déjà faite, elle n'a plus besoin d'alerte.",
};

function alertDeadline(deadline: EventDeadline): AlertDeadline {
  return { at: deadline.deadlineAt, date: deadline.deadlineDate };
}

function corrupted(error: string): AlertsError {
  return { code: "ALERT_PROVIDER_FAILURE", message: `alert planning failed: ${error}` };
}

export class AlertPlanningService {
  constructor(
    private readonly alerts: IAlertRepository,
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

  async cancel(eventId: string, actorUserId: string | null): Promise<Result<void, AppError>> {
    return this.span("cancel", () =>
      this.transactions.run(async (): Promise<Result<void, AppError>> => {
        const found = await this.alerts.findByEvent(eventId);
        if (found.isFailure) return Result.fail(found.getError());

        return this.cancelFound(found.getValue(), actorUserId);
      }),
    );
  }

  async setUserAlert(
    userId: string,
    eventId: string,
    wall: UserAlertTime,
  ): Promise<Result<AlertDto, PlanningError>> {
    return this.span("setUserAlert", () =>
      this.transactions.run(async (): Promise<Result<AlertDto, PlanningError>> => {
        const deadline = await this.armableDeadline(userId, eventId);
        if (deadline.isFailure) return Result.fail(deadline.getError());

        const time = AlertTime.fromParisWallTime(wall.date, wall.time);
        if (time.isFailure) return Result.fail(timeInvalid);

        const found = await this.alertFor(userId, eventId, deadline.getValue());
        if (found.isFailure) return Result.fail(found.getError());
        const { alert, before } = found.getValue();

        const set = alert.setByUser(time.getValue(), deadline.getValue().deadlineAt, this.clock());
        if (set.isFailure)
          return Result.fail(set.getError() === "in_past" ? timeInPast : timeAfterDeadline);

        const saved = await this.persist(alert, before, userId);
        return saved.map(() => toAlertDto(alert));
      }),
    );
  }

  async clear(userId: string, eventId: string): Promise<Result<void, PlanningError>> {
    return this.span("clear", () =>
      this.transactions.run(async (): Promise<Result<void, PlanningError>> => {
        const deadline = await this.armableDeadline(userId, eventId);
        if (deadline.isFailure) return Result.fail(deadline.getError());

        const found = await this.alerts.findOwned(userId, eventId);
        if (found.isFailure) return Result.fail(found.getError());
        if (found.getValue().isNone()) return Result.ok();

        const alert = found.getValue().unwrap();
        const before = occurrenceOf(alert);
        const reset = alert.resetToDefault(alertDeadline(deadline.getValue()), this.clock());
        if (reset.isFailure) return Result.fail(corrupted(reset.getError()));

        return this.persist(alert, before, userId);
      }),
    );
  }

  async get(userId: string, eventId: string): Promise<Result<Option<AlertDto>, PlanningError>> {
    return this.span("get", async () => {
      const deadline = await this.ownedDeadline(userId, eventId);
      if (deadline.isFailure) return Result.fail(deadline.getError());

      const found = await this.alerts.findOwned(userId, eventId);
      if (found.isFailure) return Result.fail(found.getError());

      return Result.ok(
        found
          .getValue()
          .filter((alert) => alert.isShown())
          .map(toAlertDto),
      );
    });
  }

  private async follow(event: PlannedEvent): Promise<Result<void, AppError>> {
    return this.transactions.run(async (): Promise<Result<void, AppError>> => {
      const deadline = await this.deadlines.forUser(event.userId, event.eventId);
      if (deadline.isFailure) return Result.fail(deadline.getError());

      const found = await this.alerts.findOwned(event.userId, event.eventId);
      if (found.isFailure) return Result.fail(found.getError());
      if (deadline.getValue().isNone() || deadline.getValue().unwrap().done)
        return this.cancelFound(found.getValue(), event.actorUserId);

      const now = this.clock();
      const target = alertDeadline(deadline.getValue().unwrap());
      if (found.getValue().isNone()) {
        const created = Alert.scheduleDefault({ ...event, deadline: target, now });
        if (created.isFailure) return Result.fail(corrupted(created.getError()));
        if (!created.getValue().isPending()) return Result.ok();

        return this.persist(created.getValue(), NO_OCCURRENCE, event.actorUserId);
      }

      const alert = found.getValue().unwrap();
      const before = occurrenceOf(alert);
      const followed = alert.follow(target, now);
      if (followed.isFailure) return Result.fail(corrupted(followed.getError()));

      return this.persist(alert, before, event.actorUserId);
    });
  }

  private async cancelFound(
    found: Option<Alert>,
    actorUserId: string | null,
  ): Promise<Result<void, AppError>> {
    if (found.isNone() || !found.unwrap().isPending()) return Result.ok();

    const alert = found.unwrap();
    alert.cancel();
    const saved = await this.alerts.save(alert);
    if (saved.isFailure) return saved;

    await emitEvent(this.outbox, EventTypes.ALERT_CANCELLED, "alert", alert.id.value, {
      userId: alert.get("userId"),
      alertId: alert.id.value,
      eventId: alert.get("eventId"),
      actorUserId,
    });
    return Result.ok();
  }

  private async ownedDeadline(
    userId: string,
    eventId: string,
  ): Promise<Result<EventDeadline, PlanningError>> {
    const deadline = await this.deadlines.forUser(userId, eventId);
    if (deadline.isFailure) return Result.fail(deadline.getError());

    return deadline.getValue().toResult(alertNotFound);
  }

  private async armableDeadline(
    userId: string,
    eventId: string,
  ): Promise<Result<EventDeadline, PlanningError>> {
    const deadline = await this.ownedDeadline(userId, eventId);
    if (deadline.isFailure) return deadline;
    if (deadline.getValue().done) return Result.fail(eventDone);

    return deadline;
  }

  private async alertFor(
    userId: string,
    eventId: string,
    deadline: EventDeadline,
  ): Promise<Result<{ alert: Alert; before: Occurrence }, PlanningError>> {
    const found = await this.alerts.findOwned(userId, eventId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isSome()) {
      const alert = found.getValue().unwrap();
      return Result.ok({ alert, before: occurrenceOf(alert) });
    }

    const created = Alert.scheduleDefault({
      eventId,
      userId,
      deadline: alertDeadline(deadline),
      now: this.clock(),
    });
    return created.mapError(corrupted).map((alert) => ({ alert, before: NO_OCCURRENCE }));
  }

  private async persist(
    alert: Alert,
    before: Occurrence,
    actorUserId: string | null,
  ): Promise<Result<void, AlertsError>> {
    const saved = await this.alerts.save(alert);
    if (saved.isFailure) return saved;

    const ids = { userId: alert.get("userId"), alertId: alert.id.value };
    if (alert.isPending() && alert.get("version") !== before.version) {
      await emitEvent(this.outbox, EventTypes.ALERT_SCHEDULED, "alert", alert.id.value, {
        ...ids,
        eventId: alert.get("eventId"),
        dueAt: alert.get("time").value.at.toISOString(),
        origin: alert.get("origin").value,
        actorUserId,
      });
    }
    if (before.pending && !alert.isPending())
      await emitEvent(this.outbox, EventTypes.ALERT_SKIPPED, "alert", alert.id.value, {
        ...ids,
        actorUserId,
      });
    return Result.ok();
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `AlertPlanningService > ${method}`, op: "function" },
      work,
    );
  }
}

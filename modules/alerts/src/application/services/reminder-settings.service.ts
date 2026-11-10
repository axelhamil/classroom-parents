import { type AppError, type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { ReminderValue } from "../../domain/value-objects/reminder.vo";
import { ReminderList, type ReminderRefusal } from "../../domain/value-objects/reminder-list.vo";
import {
  type DefaultRemindersDto,
  type EventRemindersDto,
  toEventRemindersDto,
} from "../dto/reminder.dto";
import {
  type AlertsError,
  alertNotFound,
  type IAlertRepository,
} from "../ports/alert-repository.port";
import type { EventDeadline, IEventDeadlines } from "../ports/event-deadlines.port";
import type { IReminderSettingsRepository } from "../ports/reminder-settings.port";
import type { AlertPlanningService } from "./alert-planning.service";
import {
  applicableReminders,
  type ReminderTarget,
  reminderTarget,
  ringsBefore,
} from "./applicable-reminders";

type SettingsError = AlertsError | AppError;

const tooMany: AlertsError = {
  code: "ALERT_REMINDER_COUNT_INVALID",
  message: "Vous pouvez programmer au plus 5 rappels. Retirez-en un pour continuer.",
};

const delayInvalid: AlertsError = {
  code: "ALERT_REMINDER_DELAY_INVALID",
  message:
    "Un rappel sonne de 0 à 14 jours avant l'échéance à une heure HH:MM, ou de 1 à 48 heures avant. Corrigez le délai.",
};

const hoursWithoutTime: AlertsError = {
  code: "ALERT_REMINDER_HOURS_INVALID",
  message:
    "Cette échéance n'a pas d'heure : choisissez un rappel en jours avant, à une heure précise.",
};

const afterDeadline: AlertsError = {
  code: "ALERT_AFTER_DEADLINE",
  message: "Un rappel doit sonner avant l'échéance. Choisissez un délai plus long.",
};

const eventDone: AlertsError = {
  code: "ALERT_EVENT_DONE_CONFLICT",
  message: "Cette échéance est déjà faite, elle n'a plus besoin de rappel.",
};

function corrupted(error: string): AlertsError {
  return { code: "ALERT_PROVIDER_FAILURE", message: `reminder settings failed: ${error}` };
}

function reminderList(values: ReminderValue[]): Result<ReminderList, AlertsError> {
  return ReminderList.from(values).mapError((refusal: ReminderRefusal) =>
    refusal === "too_many" ? tooMany : delayInvalid,
  );
}

function fitting(reminders: ReminderList, target: ReminderTarget): Result<void, AlertsError> {
  const resolved = reminders.resolve(target);
  if (resolved.isFailure) return Result.fail(corrupted(resolved.getError()));

  const misfit = resolved.getValue().find((item) => !ringsBefore(item, target));
  if (!misfit) return Result.ok();

  const refusal = misfit.time.isNone() ? hoursWithoutTime : afterDeadline;
  return Result.fail({ ...refusal, metadata: { reminder: misfit.reminder.value } });
}

export class ReminderSettingsService {
  constructor(
    private readonly settings: IReminderSettingsRepository,
    private readonly alerts: IAlertRepository,
    private readonly deadlines: IEventDeadlines,
    private readonly planning: Pick<AlertPlanningService, "replan" | "replanUpcoming">,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async defaults(userId: string): Promise<Result<DefaultRemindersDto, SettingsError>> {
    return this.span("defaults", async () => {
      const found = await this.settings.defaultsFor(userId);
      if (found.isFailure) return Result.fail(found.getError());

      return Result.ok({ reminders: found.getValue().unwrapOr(ReminderList.defaults()).value });
    });
  }

  async setDefaults(
    userId: string,
    values: ReminderValue[],
  ): Promise<Result<DefaultRemindersDto, SettingsError>> {
    return this.span("setDefaults", () =>
      this.transactions.run(async (): Promise<Result<DefaultRemindersDto, SettingsError>> => {
        const reminders = reminderList(values);
        if (reminders.isFailure) return Result.fail(reminders.getError());

        const now = this.clock();
        const saved = await this.settings.saveDefaults(userId, reminders.getValue(), now);
        if (saved.isFailure) return Result.fail(saved.getError());
        await emitEvent(this.outbox, EventTypes.ALERT_DEFAULTS_CHANGED, "user", userId, {
          userId,
          reminders: reminders.getValue().value.length,
        });

        const upcoming = await this.deadlines.upcomingFor(userId, now);
        if (upcoming.isFailure) return Result.fail(upcoming.getError());
        const replanned = await this.planning.replanUpcoming(userId, upcoming.getValue(), userId);
        if (replanned.isFailure) return Result.fail(replanned.getError());

        return Result.ok({ reminders: reminders.getValue().value });
      }),
    );
  }

  async eventReminders(
    userId: string,
    eventId: string,
  ): Promise<Result<EventRemindersDto, SettingsError>> {
    return this.span("eventReminders", async () => {
      const deadline = await this.ownedDeadline(userId, eventId);
      if (deadline.isFailure) return Result.fail(deadline.getError());

      return this.view(userId, eventId, deadline.getValue());
    });
  }

  async customizeEvent(
    userId: string,
    eventId: string,
    values: ReminderValue[],
  ): Promise<Result<EventRemindersDto, SettingsError>> {
    return this.span("customizeEvent", () =>
      this.transactions.run(async (): Promise<Result<EventRemindersDto, SettingsError>> => {
        const deadline = await this.armableDeadline(userId, eventId);
        if (deadline.isFailure) return Result.fail(deadline.getError());

        const reminders = reminderList(values);
        if (reminders.isFailure) return Result.fail(reminders.getError());
        const fits = fitting(reminders.getValue(), reminderTarget(deadline.getValue()));
        if (fits.isFailure) return Result.fail(fits.getError());

        const saved = await this.settings.saveEventPlan(
          userId,
          eventId,
          reminders.getValue(),
          this.clock(),
        );
        if (saved.isFailure) return Result.fail(saved.getError());
        await emitEvent(this.outbox, EventTypes.ALERT_REMINDERS_CUSTOMIZED, "event", eventId, {
          userId,
          eventId,
          reminders: reminders.getValue().value.length,
        });

        const replanned = await this.planning.replan({ eventId, userId, actorUserId: userId });
        if (replanned.isFailure) return Result.fail(replanned.getError());

        return this.view(userId, eventId, deadline.getValue());
      }),
    );
  }

  async resetEvent(userId: string, eventId: string): Promise<Result<void, SettingsError>> {
    return this.span("resetEvent", () =>
      this.transactions.run(async (): Promise<Result<void, SettingsError>> => {
        const deadline = await this.armableDeadline(userId, eventId);
        if (deadline.isFailure) return Result.fail(deadline.getError());

        const cleared = await this.settings.clearEventPlan(userId, eventId);
        if (cleared.isFailure) return Result.fail(cleared.getError());
        if (!cleared.getValue()) return Result.ok();

        await emitEvent(this.outbox, EventTypes.ALERT_REMINDERS_RESET, "event", eventId, {
          userId,
          eventId,
        });
        return this.planning.replan({ eventId, userId, actorUserId: userId });
      }),
    );
  }

  private async view(
    userId: string,
    eventId: string,
    deadline: EventDeadline,
  ): Promise<Result<EventRemindersDto, SettingsError>> {
    const applicable = await applicableReminders(this.settings, userId, eventId);
    if (applicable.isFailure) return Result.fail(applicable.getError());
    const { reminders, customized } = applicable.getValue();

    const target = reminderTarget(deadline);
    const resolved = reminders.resolve(target);
    if (resolved.isFailure) return Result.fail(corrupted(resolved.getError()));

    const alerts = await this.alerts.listOwned(userId, eventId);
    if (alerts.isFailure) return Result.fail(alerts.getError());

    const fitting = resolved
      .getValue()
      .map((item) => ({ ...item, fits: ringsBefore(item, target) }));
    return Result.ok(toEventRemindersDto(fitting, customized, alerts.getValue()));
  }

  private async ownedDeadline(
    userId: string,
    eventId: string,
  ): Promise<Result<EventDeadline, SettingsError>> {
    const deadline = await this.deadlines.forUser(userId, eventId);
    if (deadline.isFailure) return Result.fail(deadline.getError());

    return deadline.getValue().toResult(alertNotFound);
  }

  private async armableDeadline(
    userId: string,
    eventId: string,
  ): Promise<Result<EventDeadline, SettingsError>> {
    const deadline = await this.ownedDeadline(userId, eventId);
    if (deadline.isFailure) return deadline;
    if (deadline.getValue().done) return Result.fail(eventDone);

    return deadline;
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `ReminderSettingsService > ${method}`, op: "function" },
      work,
    );
  }
}

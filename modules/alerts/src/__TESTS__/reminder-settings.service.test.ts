import { beforeEach, describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { AlertsError, IAlertRepository } from "../application/ports/alert-repository.port";
import type { EventDeadline, IEventDeadlines } from "../application/ports/event-deadlines.port";
import type { IReminderSettingsRepository } from "../application/ports/reminder-settings.port";
import { AlertPlanningService } from "../application/services/alert-planning.service";
import { ReminderSettingsService } from "../application/services/reminder-settings.service";
import type { Alert } from "../domain/alert.aggregate";
import { QuietHours } from "../domain/value-objects/quiet-hours.vo";
import type { ReminderValue } from "../domain/value-objects/reminder.vo";
import { ReminderList } from "../domain/value-objects/reminder-list.vo";
import { ALERT_EVENT, existingAlert, PARENT, paris } from "../testing/alert.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");
const OTHER_EVENT = "0196a000-0000-7000-8000-0000000000e2";

let alerts: PortMock<IAlertRepository>;
let settings: PortMock<IReminderSettingsRepository>;
let deadlines: PortMock<IEventDeadlines>;
let outbox: PortMock<IOutboxRepository>;
let service: ReminderSettingsService;

const days = (count: number, time: string): ReminderValue => ({
  kind: "days_before",
  days: count,
  time,
});

const hours = (count: number): ReminderValue => ({ kind: "hours_before", hours: count });

function deadlineOn(deadlineDate: string, deadlineTime?: string, done = false): EventDeadline {
  return {
    deadlineAt: paris(deadlineDate, deadlineTime ?? "23:59"),
    deadlineDate,
    deadlineTime,
    done,
    needsReview: false,
  };
}

function givenEvent(deadline: EventDeadline): void {
  deadlines.forUser.mockResolvedValue(
    Result.ok<Option<EventDeadline>, AppError>(Option.some(deadline)),
  );
}

function givenNoEvent(): void {
  deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));
}

function givenAlerts(...existing: Alert[]): void {
  alerts.lockOwned.mockResolvedValue(Result.ok<Alert[], AlertsError>(existing));
  alerts.lockOwnedMany.mockResolvedValue(Result.ok<Alert[], AlertsError>(existing));
}

function givenUpcoming(...eventIds: string[]): void {
  deadlines.upcomingFor.mockResolvedValue(
    Result.ok(eventIds.map((eventId) => ({ eventId, ...deadlineOn("2026-11-15") }))),
  );
}

function savedAlerts(): Alert[] {
  return alerts.saveMany.mock.calls.flatMap(([saved]) => saved);
}

function eventTypes(): string[] {
  return enqueuedEvents(outbox).map(({ eventType }) => eventType);
}

beforeEach(() => {
  alerts = mockPort<IAlertRepository>();
  settings = mockPort<IReminderSettingsRepository>();
  deadlines = mockPort<IEventDeadlines>();
  outbox = mockPort<IOutboxRepository>();

  givenAlerts();
  alerts.saveMany.mockResolvedValue(Result.ok());
  alerts.listOwned.mockImplementation(async () => Result.ok(savedAlerts()));
  settings.defaultsFor.mockResolvedValue(Result.ok(Option.none()));
  settings.eventPlanFor.mockResolvedValue(Result.ok(Option.none()));
  settings.eventPlansFor.mockResolvedValue(Result.ok(new Map()));
  settings.saveDefaults.mockResolvedValue(Result.ok());
  settings.saveEventPlan.mockResolvedValue(Result.ok());
  settings.clearEventPlan.mockResolvedValue(Result.ok(true));
  settings.quietHoursFor.mockResolvedValue(Result.ok(Option.none()));
  settings.saveQuietHours.mockImplementation(async (_user, quiet) => {
    settings.quietHoursFor.mockResolvedValue(Result.ok(Option.some(quiet)));
    return Result.ok();
  });
  deadlines.upcomingFor.mockResolvedValue(Result.ok([]));
  givenEvent(deadlineOn("2026-11-15"));

  const unitOfWork = mockUnitOfWork().unitOfWork;
  const planning = new AlertPlanningService(
    alerts,
    settings,
    deadlines,
    unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
  service = new ReminderSettingsService(
    settings,
    alerts,
    deadlines,
    planning,
    unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("default reminders", () => {
  it("given a parent who never set them, then the defaults are one reminder 2 days before at 18:00", async () => {
    const result = await service.defaults(PARENT);

    expect(result.getValue()).toEqual({ reminders: [days(2, "18:00")] });
  });

  it("given six reminders, then ALERT_REMINDER_COUNT_INVALID and nothing is written", async () => {
    const result = await service.setDefaults(PARENT, [
      days(0, "07:00"),
      days(1, "07:00"),
      days(2, "07:00"),
      days(3, "07:00"),
      days(4, "07:00"),
      days(5, "07:00"),
    ]);

    expect(result.getError().code).toBe("ALERT_REMINDER_COUNT_INVALID");
    expect(settings.saveDefaults).not.toHaveBeenCalled();
  });

  it.each([
    ["15 days before", days(15, "18:00")],
    ["a time that does not exist", days(1, "24:00")],
    ["0 hours before", hours(0)],
    ["49 hours before", hours(49)],
    ["a fraction of an hour", hours(1.5)],
  ])("given a reminder %s, then ALERT_REMINDER_DELAY_INVALID", async (_label, reminder) => {
    const result = await service.setDefaults(PARENT, [reminder]);

    expect(result.getError().code).toBe("ALERT_REMINDER_DELAY_INVALID");
    expect(settings.saveDefaults).not.toHaveBeenCalled();
  });

  it("given the same reminder twice, then it is kept once", async () => {
    const result = await service.setDefaults(PARENT, [days(1, "18:00"), days(1, "18:00")]);

    expect(result.getValue()).toEqual({ reminders: [days(1, "18:00")] });
  });

  it("given an empty list, then the parent turns every default reminder off", async () => {
    const result = await service.setDefaults(PARENT, []);

    expect(result.getValue()).toEqual({ reminders: [] });
    expect(settings.saveDefaults.mock.calls[0]?.[1].value).toEqual([]);
  });

  it("given new defaults, then they are stored, ALERT_DEFAULTS_CHANGED is emitted and every upcoming event is replanned with them", async () => {
    givenUpcoming(ALERT_EVENT, OTHER_EVENT);
    settings.defaultsFor.mockResolvedValue(
      Result.ok(Option.some(ReminderList.from([days(1, "19:00")]).getValue())),
    );

    const result = await service.setDefaults(PARENT, [days(1, "19:00")]);

    expect(result.isSuccess).toBe(true);
    expect(deadlines.upcomingFor).toHaveBeenCalledWith(PARENT, NOW);
    expect(enqueuedEvents(outbox)[0]).toEqual({
      eventType: EventTypes.ALERT_DEFAULTS_CHANGED,
      aggregateId: PARENT,
      payload: { userId: PARENT, reminders: 1 },
    });
    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d1@19:00", "d1@19:00"]);
    expect(enqueuedEvents(outbox)[1]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { actorUserId: PARENT, origin: "default" },
    });
  });

  it("given a customized upcoming event, when the defaults change, then it keeps its own reminders", async () => {
    givenUpcoming(ALERT_EVENT, OTHER_EVENT);
    settings.defaultsFor.mockResolvedValue(
      Result.ok(Option.some(ReminderList.from([days(1, "19:00")]).getValue())),
    );
    settings.eventPlansFor.mockResolvedValue(
      Result.ok(new Map([[OTHER_EVENT, ReminderList.from([days(3, "08:00")]).getValue()]])),
    );

    await service.setDefaults(PARENT, [days(1, "19:00")]);

    expect(settings.eventPlansFor).toHaveBeenCalledWith(PARENT, [ALERT_EVENT, OTHER_EVENT]);
    expect(
      savedAlerts().map((alert) => [alert.get("eventId"), alert.key(), alert.get("origin").value]),
    ).toEqual([
      [ALERT_EVENT, "d1@19:00", "default"],
      [OTHER_EVENT, "d3@08:00", "user"],
    ]);
  });

  it("given a reminder already sent, when the defaults change, then it is never sent again nor cancelled", async () => {
    givenUpcoming(ALERT_EVENT);
    settings.defaultsFor.mockResolvedValue(
      Result.ok(Option.some(ReminderList.from([days(2, "18:00"), days(1, "07:30")]).getValue())),
    );
    givenAlerts(existingAlert({ status: "sent" }));

    await service.setDefaults(PARENT, [days(2, "18:00"), days(1, "07:30")]);

    const sent = savedAlerts().find((alert) => alert.key() === "d2@18:00");
    expect(sent?.get("status").value).toBe("sent");
    expect(sent?.get("version")).toBe(1);
  });
});

describe("reminders of one event", () => {
  it("given another family's event, then reading, setting and resetting answer ALERT_NOT_FOUND and write nothing (RF 5)", async () => {
    givenNoEvent();

    const read = await service.eventReminders(PARENT, ALERT_EVENT);
    const set = await service.customizeEvent(PARENT, ALERT_EVENT, [days(1, "07:30")]);
    const reset = await service.resetEvent(PARENT, ALERT_EVENT);

    expect(read.getError().code).toBe("ALERT_NOT_FOUND");
    expect(set.getError().code).toBe("ALERT_NOT_FOUND");
    expect(reset.getError().code).toBe("ALERT_NOT_FOUND");
    expect(settings.saveEventPlan).not.toHaveBeenCalled();
    expect(settings.clearEventPlan).not.toHaveBeenCalled();
  });

  it("given a done event, then setting its reminders answers ALERT_EVENT_DONE_CONFLICT", async () => {
    givenEvent(deadlineOn("2026-11-15", undefined, true));

    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [days(1, "07:30")]);

    expect(result.getError().code).toBe("ALERT_EVENT_DONE_CONFLICT");
    expect(settings.saveEventPlan).not.toHaveBeenCalled();
  });

  it("given a deadline without time, then a reminder in hours answers ALERT_REMINDER_HOURS_INVALID", async () => {
    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [hours(2)]);

    expect(result.getError().code).toBe("ALERT_REMINDER_HOURS_INVALID");
  });

  it("given a list with one reminder that does not fit the deadline, then the refusal names that reminder", async () => {
    givenEvent(deadlineOn("2026-11-15", "08:00"));

    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [
      days(2, "18:00"),
      days(0, "18:00"),
    ]);

    expect(result.getError()).toMatchObject({
      code: "ALERT_AFTER_DEADLINE",
      metadata: { reminder: days(0, "18:00") },
    });
  });

  it("given defaults that do not fit a deadline, then reading its reminders flags them as not fitting while a past one still fits", async () => {
    settings.defaultsFor.mockResolvedValue(
      Result.ok(
        Option.some(
          ReminderList.from([
            days(7, "18:00"),
            days(0, "18:00"),
            hours(3),
            days(1, "19:00"),
          ]).getValue(),
        ),
      ),
    );
    givenEvent(deadlineOn("2026-11-15"));
    const untimed = await service.eventReminders(PARENT, ALERT_EVENT);
    givenEvent(deadlineOn("2026-11-15", "08:00"));
    const morning = await service.eventReminders(PARENT, ALERT_EVENT);

    const fitting = (result: typeof untimed) =>
      result.getValue().reminders.map(({ reminder, fits }) => [reminder, fits]);
    expect(fitting(untimed)).toEqual([
      [days(7, "18:00"), true],
      [days(0, "18:00"), true],
      [hours(3), false],
      [days(1, "19:00"), true],
    ]);
    expect(fitting(morning)).toEqual([
      [days(7, "18:00"), true],
      [days(0, "18:00"), false],
      [hours(3), true],
      [days(1, "19:00"), true],
    ]);
  });

  it("given a reminder that would ring after the deadline, then ALERT_AFTER_DEADLINE", async () => {
    givenEvent(deadlineOn("2026-11-15", "08:00"));

    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [days(0, "18:00")]);

    expect(result.getError().code).toBe("ALERT_AFTER_DEADLINE");
  });

  it("given six reminders for the event, then ALERT_REMINDER_COUNT_INVALID", async () => {
    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [
      hours(1),
      hours(2),
      hours(3),
      hours(4),
      hours(5),
      hours(6),
    ]);

    expect(result.getError().code).toBe("ALERT_REMINDER_COUNT_INVALID");
  });

  it("given two reminders, then the list is stored, ALERT_REMINDERS_CUSTOMIZED is emitted and both are planned by the parent", async () => {
    settings.saveEventPlan.mockImplementation(async (_user, _event, reminders) => {
      settings.eventPlanFor.mockResolvedValue(Result.ok(Option.some(reminders)));
      return Result.ok();
    });

    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [
      days(1, "07:30"),
      days(3, "20:00"),
    ]);

    expect(result.getValue()).toEqual({
      customized: true,
      reminders: [
        {
          reminder: days(1, "07:30"),
          dueAt: "2026-11-14T06:30:00.000Z",
          status: "pending",
          fits: true,
        },
        {
          reminder: days(3, "20:00"),
          dueAt: "2026-11-12T19:00:00.000Z",
          status: "pending",
          fits: true,
        },
      ],
    });
    expect(enqueuedEvents(outbox)[0]).toEqual({
      eventType: EventTypes.ALERT_REMINDERS_CUSTOMIZED,
      aggregateId: ALERT_EVENT,
      payload: { userId: PARENT, eventId: ALERT_EVENT, reminders: 2 },
    });
    expect(savedAlerts().map((alert) => alert.get("origin").value)).toEqual(["user", "user"]);
  });

  it("given the only reminder of this event already past while the deadline is still ahead, then it rings once in the next minute", async () => {
    givenEvent(deadlineOn("2026-11-11"));
    settings.saveEventPlan.mockImplementation(async (_user, _event, reminders) => {
      settings.eventPlanFor.mockResolvedValue(Result.ok(Option.some(reminders)));
      return Result.ok();
    });

    const result = await service.customizeEvent(PARENT, ALERT_EVENT, [days(3, "18:00")]);

    expect(result.getValue().reminders).toEqual([
      {
        reminder: days(3, "18:00"),
        dueAt: "2026-11-10T09:01:00.000Z",
        status: "pending",
        fits: true,
      },
    ]);
  });

  it("given a customized event, when the parent goes back to the defaults, then ALERT_REMINDERS_RESET is emitted and the defaults replace its reminders", async () => {
    givenAlerts(
      existingAlert({ origin: "user", reminder: "d1@07:30", date: "2026-11-14", time: "07:30" }),
    );

    const result = await service.resetEvent(PARENT, ALERT_EVENT);

    expect(result.isSuccess).toBe(true);
    expect(eventTypes()).toEqual([
      EventTypes.ALERT_REMINDERS_RESET,
      EventTypes.ALERT_CANCELLED,
      EventTypes.ALERT_SCHEDULED,
    ]);
    expect(savedAlerts().map((alert) => [alert.key(), alert.get("status").value])).toEqual([
      ["d1@07:30", "skipped"],
      ["d2@18:00", "pending"],
    ]);
  });

  it("given a reminder sent at an instant the deadline no longer resolves to, then reading it never shows that send", async () => {
    settings.defaultsFor.mockResolvedValue(
      Result.ok(Option.some(ReminderList.from([hours(3)]).getValue())),
    );
    givenEvent(deadlineOn("2026-11-10", "10:30"));
    alerts.listOwned.mockResolvedValue(
      Result.ok([
        existingAlert({
          reminder: "h3",
          status: "sent",
          date: "2026-11-10",
          time: "08:00",
          deadlineAt: paris("2026-11-10", "11:00"),
        }),
      ]),
    );

    const result = await service.eventReminders(PARENT, ALERT_EVENT);

    expect(result.getValue().reminders).toEqual([
      {
        reminder: hours(3),
        dueAt: "2026-11-10T06:30:00.000Z",
        status: "unplanned",
        fits: true,
      },
    ]);
  });

  it("given a reminder moved out of the quiet hours and then sent, then reading it shows the send at its real time", async () => {
    settings.defaultsFor.mockResolvedValue(
      Result.ok(Option.some(ReminderList.from([days(1, "22:00")]).getValue())),
    );
    givenEvent(deadlineOn("2026-11-16", "08:00"));
    alerts.listOwned.mockResolvedValue(
      Result.ok([
        existingAlert({
          reminder: "d1@22:00",
          status: "sent",
          date: "2026-11-16",
          time: "07:00",
          deadlineAt: paris("2026-11-16", "08:00"),
        }),
      ]),
    );

    const result = await service.eventReminders(PARENT, ALERT_EVENT);

    expect(result.getValue().reminders).toEqual([
      {
        reminder: days(1, "22:00"),
        dueAt: "2026-11-16T06:00:00.000Z",
        status: "sent",
        fits: true,
      },
    ]);
  });

  it("given an event that follows the defaults, then reading it shows each default reminder and its state", async () => {
    alerts.listOwned.mockResolvedValue(Result.ok([existingAlert({ status: "sent" })]));

    const result = await service.eventReminders(PARENT, ALERT_EVENT);

    expect(result.getValue()).toEqual({
      customized: false,
      reminders: [
        {
          reminder: days(2, "18:00"),
          dueAt: "2026-11-13T17:00:00.000Z",
          status: "sent",
          fits: true,
        },
      ],
    });
  });
});

describe("quiet hours", () => {
  it("given a parent who never set them, then no alert rings from 21:00 to 07:00", async () => {
    const result = await service.quietHours(PARENT);

    expect(result.getValue()).toEqual({ enabled: true, start: "21:00", end: "07:00" });
  });

  it("given new quiet hours covering an upcoming alert, then they are stored, announced with the parent as actor and the alert rings when they end", async () => {
    givenUpcoming(ALERT_EVENT);
    const quiet = { enabled: true, start: "17:00", end: "19:00" };

    const result = await service.setQuietHours(PARENT, quiet);

    expect(result.getValue()).toEqual(quiet);
    expect(settings.saveQuietHours).toHaveBeenCalledWith(
      PARENT,
      QuietHours.from(quiet).getValue(),
      NOW,
    );
    expect(enqueuedEvents(outbox)[0]).toEqual({
      eventType: EventTypes.ALERT_QUIET_HOURS_CHANGED,
      aggregateId: PARENT,
      payload: { userId: PARENT, ...quiet },
    });
    expect(savedAlerts().map((alert) => alert.get("time").value.at)).toEqual([
      paris("2026-11-13", "19:00"),
    ]);
  });

  it("given the quiet hours already in force, then nothing is written nor announced", async () => {
    const result = await service.setQuietHours(PARENT, {
      enabled: true,
      start: "21:00",
      end: "07:00",
    });

    expect(result.isSuccess).toBe(true);
    expect(settings.saveQuietHours).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it.each([
    ["the same start and end", { enabled: true, start: "08:00", end: "08:00" }],
    ["a time that does not exist", { enabled: true, start: "24:00", end: "07:00" }],
  ])("given %s, then ALERT_QUIET_HOURS_INVALID and nothing is written", async (_, quiet) => {
    const result = await service.setQuietHours(PARENT, quiet);

    expect(result.getError().code).toBe("ALERT_QUIET_HOURS_INVALID");
    expect(settings.saveQuietHours).not.toHaveBeenCalled();
  });
});

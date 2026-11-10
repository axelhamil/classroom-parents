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
import type { Alert } from "../domain/alert.aggregate";
import type { ReminderValue } from "../domain/value-objects/reminder.vo";
import { ReminderList } from "../domain/value-objects/reminder-list.vo";
import { ALERT_EVENT, ALERT_ID, existingAlert, PARENT, paris } from "../testing/alert.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");

let alerts: PortMock<IAlertRepository>;
let settings: PortMock<IReminderSettingsRepository>;
let deadlines: PortMock<IEventDeadlines>;
let outbox: PortMock<IOutboxRepository>;
let service: AlertPlanningService;

function deadlineOn(
  deadlineDate: string,
  deadlineTime?: string,
  done = false,
  needsReview = false,
): EventDeadline {
  return {
    deadlineAt: paris(deadlineDate, deadlineTime ?? "23:59"),
    deadlineDate,
    deadlineTime,
    done,
    needsReview,
  };
}

function givenEvent(deadline: EventDeadline): void {
  deadlines.forUser.mockResolvedValue(
    Result.ok<Option<EventDeadline>, AppError>(Option.some(deadline)),
  );
}

function givenAlerts(...existing: Alert[]): void {
  alerts.lockOwned.mockResolvedValue(Result.ok<Alert[], AlertsError>(existing));
  alerts.lockByEvent.mockResolvedValue(Result.ok<Alert[], AlertsError>(existing));
}

function list(...values: ReminderValue[]): ReminderList {
  return ReminderList.from(values).getValue();
}

function givenDefaults(...values: ReminderValue[]): void {
  settings.defaultsFor.mockResolvedValue(Result.ok(Option.some(list(...values))));
}

function givenEventReminders(...values: ReminderValue[]): void {
  settings.eventPlanFor.mockResolvedValue(Result.ok(Option.some(list(...values))));
}

function savedAlerts(): Alert[] {
  return alerts.saveMany.mock.calls.flatMap(([saved]) => saved);
}

function saved(): Alert | undefined {
  return savedAlerts().at(-1);
}

function dueTimes(): string[] {
  return savedAlerts().map((alert) => alert.get("time").value.at.toISOString());
}

const planned = { eventId: ALERT_EVENT, userId: PARENT, actorUserId: null };

const days = (count: number, time: string): ReminderValue => ({
  kind: "days_before",
  days: count,
  time,
});

const hours = (count: number): ReminderValue => ({ kind: "hours_before", hours: count });

beforeEach(() => {
  alerts = mockPort<IAlertRepository>();
  settings = mockPort<IReminderSettingsRepository>();
  deadlines = mockPort<IEventDeadlines>();
  outbox = mockPort<IOutboxRepository>();

  givenAlerts();
  alerts.saveMany.mockResolvedValue(Result.ok());
  settings.defaultsFor.mockResolvedValue(Result.ok(Option.none()));
  settings.eventPlanFor.mockResolvedValue(Result.ok(Option.none()));
  givenEvent(deadlineOn("2026-11-15"));

  service = new AlertPlanningService(
    alerts,
    settings,
    deadlines,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("planDefault with the parent's default reminders", () => {
  it("given a parent who never set defaults, then one pending reminder at J-2 18:00 Paris is stored and ALERT_SCHEDULED names it", async () => {
    const result = await service.planDefault(planned);

    expect(result.isSuccess).toBe(true);
    const alert = saved();
    expect(alert?.get("status").value).toBe("pending");
    expect(alert?.get("origin").value).toBe("default");
    expect(alert?.key()).toBe("d2@18:00");
    expect(alert?.get("deadlineAt")).toEqual(new Date("2026-11-15T22:59:00.000Z"));
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_SCHEDULED,
        aggregateId: alert?.id.value ?? "",
        payload: {
          userId: PARENT,
          eventId: ALERT_EVENT,
          alertId: alert?.id.value ?? "",
          reminder: "d2@18:00",
          dueAt: "2026-11-13T17:00:00.000Z",
          origin: "default",
          actorUserId: null,
        },
      },
    ]);
  });

  it("given defaults of two reminders, then each one is planned as its own alert", async () => {
    givenDefaults(days(3, "18:00"), days(1, "07:30"));

    await service.planDefault(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d3@18:00", "d1@07:30"]);
    expect(dueTimes()).toEqual(["2026-11-12T17:00:00.000Z", "2026-11-14T06:30:00.000Z"]);
    expect(new Set(savedAlerts().map((alert) => alert.id.value)).size).toBe(2);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_SCHEDULED,
      EventTypes.ALERT_SCHEDULED,
    ]);
  });

  it("given defaults set to no reminder, then no alert is planned", async () => {
    givenDefaults();

    await service.planDefault(planned);

    expect(alerts.saveMany).not.toHaveBeenCalled();
  });

  it("given two reminders resolving to the same instant, then they are merged into one alert", async () => {
    givenEvent(deadlineOn("2026-11-15", "17:00"));
    givenDefaults(days(0, "15:00"), hours(2));

    await service.planDefault(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d0@15:00"]);
    expect(dueTimes()).toEqual(["2026-11-15T14:00:00.000Z"]);
  });

  it("given an hours-before reminder and a deadline without time, then only the reminders in days are planned", async () => {
    givenDefaults(hours(3), days(1, "19:00"));

    await service.planDefault(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d1@19:00"]);
  });

  it("given an hours-before reminder and a timed deadline, then it rings that many hours before", async () => {
    givenEvent(deadlineOn("2026-11-15", "08:30"));
    givenDefaults(hours(10));

    await service.planDefault(planned);

    expect(dueTimes()).toEqual(["2026-11-14T21:30:00.000Z"]);
  });

  it("given a reminder whose instant is already past, then it is not planned and no catch-up is sent (RF 2)", async () => {
    givenEvent(deadlineOn("2026-11-11"));
    givenDefaults(days(2, "18:00"), days(0, "07:00"));

    await service.planDefault(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d0@07:00"]);
  });

  it("given an event the agenda no longer shows (masked by a coursework, withdrawn or deleted), then every pending reminder is cancelled", async () => {
    givenAlerts(
      existingAlert(),
      existingAlert({ id: "0196a000-0000-7000-8000-0000000000a2", reminder: "d1@07:30" }),
    );
    deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));

    await service.planDefault(planned);

    expect(savedAlerts().map((alert) => alert.get("status").value)).toEqual(["skipped", "skipped"]);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_CANCELLED,
      EventTypes.ALERT_CANCELLED,
    ]);
  });

  it("given an alert cancelled by a withdrawal, when the withdrawal is lifted, then it is pending again", async () => {
    givenAlerts(existingAlert({ status: "skipped" }));

    await service.planDefault(planned);

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.id.value).toBe(ALERT_ID);
  });

  it("given a reminder already sent, when the agenda plans the event again for the same day, then it is never sent twice", async () => {
    givenAlerts(existingAlert({ status: "sent" }));

    await service.planDefault(planned);

    expect(saved()?.get("status").value).toBe("sent");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("an event with reminders of its own", () => {
  it("given the parent customized the event, then its own reminders are planned with origin user and the defaults are ignored", async () => {
    givenDefaults(days(2, "18:00"));
    givenEventReminders(days(1, "07:30"), days(4, "20:00"));

    await service.planDefault(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d1@07:30", "d4@20:00"]);
    expect(savedAlerts().map((alert) => alert.get("origin").value)).toEqual(["user", "user"]);
  });

  it("given a customized event, when the defaults change, then its reminders stay as they are", async () => {
    givenEventReminders(days(1, "07:30"));
    givenDefaults(days(5, "18:00"));
    givenAlerts(
      existingAlert({ origin: "user", reminder: "d1@07:30", date: "2026-11-14", time: "07:30" }),
    );

    await service.replan(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d1@07:30"]);
    expect(saved()?.get("version")).toBe(1);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a pending reminder the parent removed from the list, then it is cancelled", async () => {
    givenEventReminders(days(1, "07:30"));
    givenAlerts(existingAlert({ reminder: "d2@18:00" }));

    await service.replan({ ...planned, actorUserId: PARENT });

    const cancelled = savedAlerts().find((alert) => alert.key() === "d2@18:00");
    expect(cancelled?.get("status").value).toBe("skipped");
    expect(enqueuedEvents(outbox)).toContainEqual({
      eventType: EventTypes.ALERT_CANCELLED,
      aggregateId: ALERT_ID,
      payload: { userId: PARENT, alertId: ALERT_ID, eventId: ALERT_EVENT, actorUserId: PARENT },
    });
  });

  it("given a reminder already sent and removed from the list, then it stays sent", async () => {
    givenEventReminders(days(1, "07:30"));
    givenAlerts(existingAlert({ status: "sent", reminder: "d2@18:00" }));

    await service.replan(planned);

    expect(savedAlerts().find((alert) => alert.key() === "d2@18:00")).toBeUndefined();
  });
});

describe("replan when the deadline moves", () => {
  it("given a reminder already sent, when the deadline moves to another day, then a new occurrence of that reminder is planned", async () => {
    givenAlerts(existingAlert({ status: "sent" }));
    givenEvent(deadlineOn("2026-11-22"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-20", "18:00"));
    expect(saved()?.get("sentAt").isNone()).toBe(true);
    expect(saved()?.get("version")).toBe(2);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { dueAt: "2026-11-20T17:00:00.000Z", reminder: "d2@18:00" },
    });
  });

  it("given a reminder already sent, when only the hour of the deadline changes, then it stays sent", async () => {
    givenAlerts(existingAlert({ status: "sent" }));
    givenEvent(deadlineOn("2026-11-15", "08:00"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("sent");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a reminder in hours already sent, when the deadline hour moves later the same day, then a new occurrence rings at the new instant", async () => {
    givenDefaults(hours(3));
    givenAlerts(
      existingAlert({
        reminder: "h3",
        status: "sent",
        date: "2026-11-20",
        time: "05:00",
        deadlineAt: paris("2026-11-20", "08:00"),
      }),
    );
    givenEvent(deadlineOn("2026-11-20", "17:00"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-20", "14:00"));
    expect(saved()?.get("sentAt").isNone()).toBe(true);
    expect(saved()?.get("version")).toBe(2);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { dueAt: "2026-11-20T13:00:00.000Z", reminder: "h3" },
    });
  });

  it("given a reminder in hours already sent, when the deadline moves so its new instant is already past, then it stays sent and nothing rings again", async () => {
    givenDefaults(hours(3));
    givenAlerts(
      existingAlert({
        reminder: "h3",
        status: "sent",
        date: "2026-11-10",
        time: "08:00",
        deadlineAt: paris("2026-11-10", "11:00"),
      }),
    );
    givenEvent(deadlineOn("2026-11-10", "10:30"));

    await service.replan(planned);

    expect(savedAlerts().map((alert) => alert.get("status").value)).not.toContain("pending");
    expect(savedAlerts().map((alert) => alert.get("status").value)).not.toContain("skipped");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a pending reminder in days, when the deadline moves, then it is recalculated from the new day", async () => {
    givenEventReminders(days(1, "07:30"));
    givenAlerts(
      existingAlert({ origin: "user", reminder: "d1@07:30", date: "2026-11-14", time: "07:30" }),
    );
    givenEvent(deadlineOn("2026-11-20"));

    await service.replan({ ...planned, actorUserId: PARENT });

    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-19", "07:30"));
    expect(saved()?.get("version")).toBe(2);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { origin: "user", actorUserId: PARENT },
    });
  });

  it("given a pending reminder in hours, when the deadline hour moves, then it follows the new hour", async () => {
    givenEventReminders(hours(3));
    givenAlerts(
      existingAlert({
        origin: "user",
        reminder: "h3",
        date: "2026-11-15",
        time: "14:00",
        deadlineAt: paris("2026-11-15", "17:00"),
      }),
    );
    givenEvent(deadlineOn("2026-11-15", "18:00"));

    await service.replan(planned);

    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-15", "15:00"));
    expect(saved()?.get("status").value).toBe("pending");
  });

  it("given a reminder on the deadline day, when the deadline moves earlier than it, then it is skipped", async () => {
    givenEventReminders(days(0, "18:00"));
    givenAlerts(
      existingAlert({ origin: "user", reminder: "d0@18:00", date: "2026-11-15", time: "18:00" }),
    );
    givenEvent(deadlineOn("2026-11-15", "08:00"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("skipped");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_SKIPPED,
        aggregateId: ALERT_ID,
        payload: { userId: PARENT, alertId: ALERT_ID, actorUserId: null },
      },
    ]);
  });

  it("given a reminder on the day DST starts, then it rings at 18:00 Paris summer time", async () => {
    givenEvent(deadlineOn("2027-03-28"));
    givenDefaults(days(0, "18:00"));

    await service.replan(planned);

    expect(dueTimes()).toEqual(["2027-03-28T16:00:00.000Z"]);
  });

  it("given a parent's reminder sent 1 day before at 02:30, when the deadline moves to the day after the spring change, then the new occurrence falls at 03:30 Paris", async () => {
    givenEventReminders(days(1, "02:30"));
    givenAlerts(
      existingAlert({
        status: "sent",
        origin: "user",
        reminder: "d1@02:30",
        date: "2026-11-14",
        time: "02:30",
      }),
    );
    givenEvent(deadlineOn("2027-03-29"));

    await service.replan(planned);

    expect(saved()?.get("time").value).toEqual({
      date: "2027-03-28",
      time: "03:30",
      at: new Date("2027-03-28T01:30:00.000Z"),
    });
  });
});

describe("the hour repeated when Paris goes back to winter time", () => {
  it("given reminders 6 and 7 hours before a deadline at 08:00 on 2027-10-31, then both resolve to 00:00 UTC and merge into one alert", async () => {
    givenEvent(deadlineOn("2027-10-31", "08:00"));
    givenDefaults(hours(6), hours(7));

    await service.replan(planned);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["h6"]);
    expect(dueTimes()).toEqual(["2027-10-31T00:00:00.000Z"]);
  });
});

describe("a done deadline", () => {
  it("given pending reminders, when the homework is done, then they are cancelled and none is replanned", async () => {
    givenAlerts(existingAlert());
    givenEvent(deadlineOn("2026-11-22", undefined, true));

    await service.replan(planned);

    expect(savedAlerts().map((alert) => alert.get("status").value)).toEqual(["skipped"]);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.ALERT_CANCELLED,
    ]);
  });

  it("given a reminder already sent, when the homework is done, then it stays sent", async () => {
    givenAlerts(existingAlert({ status: "sent" }));
    givenEvent(deadlineOn("2026-11-22", undefined, true));

    await service.replan(planned);

    expect(alerts.saveMany).not.toHaveBeenCalled();
  });
});

describe("a deadline still to review", () => {
  it("given default reminders, when its date is corrected, then no reminder is planned and pending ones are cancelled", async () => {
    givenDefaults(days(2, "18:00"));
    givenAlerts(existingAlert());
    givenEvent(deadlineOn("2026-11-13", undefined, false, true));

    await service.replan(planned);

    expect(savedAlerts().map((alert) => alert.get("status").value)).toEqual(["skipped"]);
  });

  it("given reminders set on the event, when its date moves earlier, then they follow the corrected date", async () => {
    givenEventReminders(days(1, "20:00"));
    givenAlerts(existingAlert({ reminder: "d1@20:00", origin: "user" }));
    givenEvent(deadlineOn("2026-11-13", undefined, false, true));

    await service.replan(planned);

    expect(dueTimes()).toEqual(["2026-11-12T19:00:00.000Z"]);
  });
});

describe("cancel", () => {
  it("given pending and sent reminders, when the parent deletes the event, then only the pending ones are cancelled", async () => {
    givenAlerts(
      existingAlert(),
      existingAlert({
        id: "0196a000-0000-7000-8000-0000000000a2",
        reminder: "d1@07:30",
        status: "sent",
      }),
    );

    await service.cancel(ALERT_EVENT, PARENT);

    expect(savedAlerts().map((alert) => alert.key())).toEqual(["d2@18:00"]);
    expect(saved()?.get("status").value).toBe("skipped");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_CANCELLED,
        aggregateId: ALERT_ID,
        payload: { userId: PARENT, alertId: ALERT_ID, eventId: ALERT_EVENT, actorUserId: PARENT },
      },
    ]);
  });
});

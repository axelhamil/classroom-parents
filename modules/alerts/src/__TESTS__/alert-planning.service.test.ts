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
import { AlertPlanningService } from "../application/services/alert-planning.service";
import type { Alert } from "../domain/alert.aggregate";
import { ALERT_EVENT, ALERT_ID, existingAlert, PARENT, paris } from "../testing/alert.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");

let alerts: PortMock<IAlertRepository>;
let deadlines: PortMock<IEventDeadlines>;
let outbox: PortMock<IOutboxRepository>;
let service: AlertPlanningService;

function deadlineOn(deadlineDate: string, deadlineTime?: string, done = false): EventDeadline {
  return {
    deadlineAt: paris(deadlineDate, deadlineTime ?? "23:59"),
    deadlineDate,
    deadlineTime,
    done,
  };
}

function givenEvent(deadline: EventDeadline): void {
  deadlines.forUser.mockResolvedValue(
    Result.ok<Option<EventDeadline>, AppError>(Option.some(deadline)),
  );
}

function givenAlert(alert: Alert): void {
  alerts.findOwned.mockResolvedValue(Result.ok<Option<Alert>, AlertsError>(Option.some(alert)));
  alerts.findByEvent.mockResolvedValue(Result.ok<Option<Alert>, AlertsError>(Option.some(alert)));
}

function saved(): Alert | undefined {
  return alerts.save.mock.calls.at(-1)?.[0];
}

const planned = { eventId: ALERT_EVENT, userId: PARENT, actorUserId: null };

beforeEach(() => {
  alerts = mockPort<IAlertRepository>();
  deadlines = mockPort<IEventDeadlines>();
  outbox = mockPort<IOutboxRepository>();

  alerts.findOwned.mockResolvedValue(Result.ok(Option.none()));
  alerts.findByEvent.mockResolvedValue(Result.ok(Option.none()));
  alerts.save.mockResolvedValue(Result.ok());
  givenEvent(deadlineOn("2026-11-15"));

  service = new AlertPlanningService(
    alerts,
    deadlines,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("planDefault", () => {
  it("given a new event due in 5 days, then a pending default alert at J-2 18:00 Paris is stored and ALERT_SCHEDULED emitted", async () => {
    const result = await service.planDefault(planned);

    expect(result.isSuccess).toBe(true);
    const alert = saved();
    expect(alert?.get("status").value).toBe("pending");
    expect(alert?.get("origin").value).toBe("default");
    expect(alert?.get("time").value.at).toEqual(new Date("2026-11-13T17:00:00.000Z"));
    expect(alert?.get("deadlineAt")).toEqual(new Date("2026-11-15T22:59:00.000Z"));
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_SCHEDULED,
        aggregateId: alert?.id.value ?? "",
        payload: {
          userId: PARENT,
          eventId: ALERT_EVENT,
          alertId: alert?.id.value ?? "",
          dueAt: "2026-11-13T17:00:00.000Z",
          origin: "default",
          actorUserId: null,
        },
      },
    ]);
  });

  it("given an event due tomorrow, whose default time is already past, then no alert row is written (RF 2)", async () => {
    givenEvent(deadlineOn("2026-11-11"));

    const result = await service.planDefault(planned);

    expect(result.isSuccess).toBe(true);
    expect(alerts.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an event the agenda no longer shows (masked by a coursework, withdrawn or deleted), then no alert is planned", async () => {
    deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.planDefault(planned);

    expect(result.isSuccess).toBe(true);
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it("given an alert cancelled by a withdrawal, when the withdrawal is lifted, then it is pending again", async () => {
    givenAlert(existingAlert({ status: "skipped" }));

    await service.planDefault(planned);

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("time").value.at).toEqual(new Date("2026-11-13T17:00:00.000Z"));
  });

  it("given an alert already sent, when the agenda plans it again for the same day, then it is never sent twice", async () => {
    givenAlert(existingAlert({ status: "sent" }));

    await service.planDefault(planned);

    expect(saved()?.get("status").value ?? "sent").toBe("sent");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a pending alert, when the agenda no longer shows its event, then it is cancelled by the system and ALERT_CANCELLED is emitted", async () => {
    givenAlert(existingAlert({ status: "pending" }));
    deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));

    await service.planDefault(planned);

    expect(saved()?.get("status").value).toBe("skipped");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_CANCELLED,
        aggregateId: ALERT_ID,
        payload: { userId: PARENT, alertId: ALERT_ID, eventId: ALERT_EVENT, actorUserId: null },
      },
    ]);
  });
});

describe("replan", () => {
  it("given an alert already sent, when the teacher pushes the deadline to another day, then a new occurrence is planned at J-2 18:00 of the new day", async () => {
    givenAlert(existingAlert({ status: "sent" }));
    givenEvent(deadlineOn("2026-11-22"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("origin").value).toBe("default");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-20", "18:00"));
    expect(saved()?.get("sentAt").isNone()).toBe(true);
    expect(saved()?.get("version")).toBe(2);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { dueAt: "2026-11-20T17:00:00.000Z", actorUserId: null },
    });
  });

  it("given a parent's alert already sent 1 day before at 07:30, when the deadline moves to another day, then the new occurrence keeps 1 day before at 07:30 Paris", async () => {
    givenAlert(
      existingAlert({ status: "sent", origin: "user", date: "2026-11-14", time: "07:30" }),
    );
    givenEvent(deadlineOn("2026-11-22"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("origin").value).toBe("user");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-21", "07:30"));
    expect(saved()?.get("version")).toBe(2);
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { origin: "user", dueAt: "2026-11-21T06:30:00.000Z" },
    });
  });

  it("given a parent's alert sent 1 day before at 02:30, when the deadline moves to the day after the spring change, then the new occurrence falls at 03:30 Paris", async () => {
    givenAlert(
      existingAlert({ status: "sent", origin: "user", date: "2026-11-14", time: "02:30" }),
    );
    givenEvent(deadlineOn("2027-03-29"));

    await service.replan(planned);

    expect(saved()?.get("time").value).toEqual({
      date: "2027-03-28",
      time: "03:30",
      at: new Date("2027-03-28T01:30:00.000Z"),
    });
  });

  it("given a parent's alert already sent 3 days before, when the deadline moves to a day whose 3 days before is past, then the new occurrence is not planned", async () => {
    givenAlert(
      existingAlert({ status: "sent", origin: "user", date: "2026-11-12", time: "07:30" }),
    );
    givenEvent(deadlineOn("2026-11-12"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("skipped");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an alert already sent, when only the hour of the deadline changes, then it stays sent", async () => {
    givenAlert(existingAlert({ status: "sent" }));
    givenEvent(deadlineOn("2026-11-15", "08:00"));

    await service.replan(planned);

    expect(saved()?.get("status").value ?? "sent").toBe("sent");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given the parent moved the deadline, then ALERT_SCHEDULED names the parent as actor", async () => {
    givenAlert(existingAlert({ origin: "default", date: "2026-11-13", time: "18:00" }));
    givenEvent(deadlineOn("2026-11-25"));

    await service.replan({ ...planned, actorUserId: PARENT });

    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { actorUserId: PARENT },
    });
  });

  it("given a user alert, when the deadline moves, then the user alert keeps its time", async () => {
    givenAlert(existingAlert({ origin: "user", date: "2026-11-12", time: "07:30" }));
    givenEvent(deadlineOn("2026-11-20"));

    await service.replan(planned);

    expect(saved()?.get("origin").value).toBe("user");
    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-12", "07:30"));
    expect(saved()?.get("deadlineAt")).toEqual(new Date("2026-11-20T22:59:00.000Z"));
  });

  it("given a user alert, when the deadline moves before it, then that alert is skipped", async () => {
    givenAlert(existingAlert({ origin: "user", date: "2026-11-14", time: "18:00" }));
    givenEvent(deadlineOn("2026-11-12", "08:00"));

    await service.replan(planned);

    expect(saved()?.get("status").value).toBe("skipped");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-14", "18:00"));
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.ALERT_SKIPPED,
        aggregateId: ALERT_ID,
        payload: { userId: PARENT, alertId: ALERT_ID, actorUserId: null },
      },
    ]);
  });

  it("given a default alert, when the deadline moves, then the default time follows it", async () => {
    givenAlert(existingAlert({ origin: "default", date: "2026-11-13", time: "18:00" }));
    givenEvent(deadlineOn("2026-11-25"));

    await service.replan(planned);

    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-23", "18:00"));
    expect(saved()?.get("status").value).toBe("pending");
  });
});

describe("a done deadline", () => {
  it("given a pending default alert, when the date of a done homework changes, then no alert is replanned", async () => {
    givenAlert(existingAlert({ status: "pending", origin: "default" }));
    givenEvent(deadlineOn("2026-11-25", undefined, true));

    await service.replan(planned);

    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).not.toContain(
      EventTypes.ALERT_SCHEDULED,
    );
    expect(saved()?.get("time").value.at ?? paris("2026-11-13", "18:00")).toEqual(
      paris("2026-11-13", "18:00"),
    );
  });

  it("given an alert already sent, when the date of a done homework changes, then no new occurrence is planned", async () => {
    givenAlert(existingAlert({ status: "sent" }));
    givenEvent(deadlineOn("2026-11-22", undefined, true));

    await service.replan(planned);

    expect(saved()?.get("status").value ?? "sent").toBe("sent");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given no alert yet, when a done homework is planned, then no alert is written", async () => {
    givenEvent(deadlineOn("2026-11-22", undefined, true));

    await service.planDefault(planned);

    expect(alerts.save).not.toHaveBeenCalled();
  });

  it("given a done homework whose alert was cancelled, when the parent sets a time, then ALERT_EVENT_DONE_CONFLICT and nothing is armed", async () => {
    givenAlert(existingAlert({ status: "skipped" }));
    givenEvent(deadlineOn("2026-11-22", undefined, true));

    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2026-11-20",
      time: "18:00",
    });

    expect(result.getError().code).toBe("ALERT_EVENT_DONE_CONFLICT");
    expect(alerts.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a done homework whose alert was cancelled, when the parent resets it to the default, then ALERT_EVENT_DONE_CONFLICT and nothing is armed", async () => {
    givenAlert(existingAlert({ status: "skipped" }));
    givenEvent(deadlineOn("2026-11-22", undefined, true));

    const result = await service.clear(PARENT, ALERT_EVENT);

    expect(result.getError().code).toBe("ALERT_EVENT_DONE_CONFLICT");
    expect(alerts.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("cancel", () => {
  it("given a pending alert, when the parent deletes its event, then it becomes skipped and ALERT_CANCELLED names the parent", async () => {
    givenAlert(existingAlert({ status: "pending" }));

    const result = await service.cancel(ALERT_EVENT, PARENT);

    expect(result.isSuccess).toBe(true);
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

describe("setUserAlert", () => {
  it("given a Paris wall time on the spring DST day, then dueAt is 2027-03-28T16:00:00Z (RF 1)", async () => {
    givenEvent(deadlineOn("2027-03-30"));

    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2027-03-28",
      time: "18:00",
    });

    expect(result.getValue()).toEqual({
      date: "2027-03-28",
      time: "18:00",
      dueAt: "2027-03-28T16:00:00.000Z",
      origin: "user",
    });
    expect(saved()?.get("status").value).toBe("pending");
    expect(enqueuedEvents(outbox)[0]).toMatchObject({
      eventType: EventTypes.ALERT_SCHEDULED,
      payload: { origin: "user", dueAt: "2027-03-28T16:00:00.000Z", actorUserId: PARENT },
    });
  });

  it("given an alert already sent, when the parent sets a new time, then it is a new occurrence that can be sent again", async () => {
    givenAlert(existingAlert({ status: "sent" }));

    await service.setUserAlert(PARENT, ALERT_EVENT, { date: "2026-11-14", time: "07:30" });

    expect(saved()?.get("status").value).toBe("pending");
    expect(saved()?.get("version")).toBe(2);
  });

  it("given a time after the deadline, then ALERT_AFTER_DEADLINE and nothing is saved", async () => {
    givenEvent(deadlineOn("2026-11-15", "08:00"));

    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2026-11-15",
      time: "09:00",
    });

    expect(result.getError().code).toBe("ALERT_AFTER_DEADLINE");
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it("given a time already past, then ALERT_IN_PAST", async () => {
    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2026-11-10",
      time: "09:00",
    });

    expect(result.getError().code).toBe("ALERT_IN_PAST");
  });

  it("given a time skipped by the spring change, then ALERT_TIME_INVALID and nothing is saved", async () => {
    givenEvent(deadlineOn("2027-03-30"));

    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2027-03-28",
      time: "02:30",
    });

    expect(result.getError().code).toBe("ALERT_TIME_INVALID");
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it("given a date that does not exist, then ALERT_TIME_INVALID", async () => {
    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2026-11-31",
      time: "18:00",
    });

    expect(result.getError().code).toBe("ALERT_TIME_INVALID");
  });
});

describe("another family's event (RF 5)", () => {
  beforeEach(() => {
    deadlines.forUser.mockResolvedValue(Result.ok(Option.none()));
    givenAlert(existingAlert());
  });

  it("then setUserAlert answers ALERT_NOT_FOUND and writes nothing", async () => {
    const result = await service.setUserAlert(PARENT, ALERT_EVENT, {
      date: "2026-11-12",
      time: "18:00",
    });

    expect(result.getError().code).toBe("ALERT_NOT_FOUND");
    expect(alerts.save).not.toHaveBeenCalled();
  });

  it("then get answers ALERT_NOT_FOUND", async () => {
    const result = await service.get(PARENT, ALERT_EVENT);

    expect(result.getError().code).toBe("ALERT_NOT_FOUND");
  });

  it("then clear answers ALERT_NOT_FOUND and writes nothing", async () => {
    const result = await service.clear(PARENT, ALERT_EVENT);

    expect(result.getError().code).toBe("ALERT_NOT_FOUND");
    expect(alerts.save).not.toHaveBeenCalled();
  });
});

describe("get and clear", () => {
  it("given a pending user alert, then get returns its Paris wall time", async () => {
    givenAlert(existingAlert({ origin: "user", date: "2026-11-12", time: "07:30" }));

    const result = await service.get(PARENT, ALERT_EVENT);

    expect(result.getValue().toUndefined()).toEqual({
      date: "2026-11-12",
      time: "07:30",
      dueAt: "2026-11-12T06:30:00.000Z",
      origin: "user",
    });
  });

  it("given a skipped alert, then get answers that the event has no alert", async () => {
    givenAlert(existingAlert({ status: "skipped" }));

    const result = await service.get(PARENT, ALERT_EVENT);

    expect(result.getValue().isNone()).toBe(true);
  });

  it("given a user alert, when cleared, then the default J-2 18:00 alert comes back", async () => {
    givenAlert(existingAlert({ origin: "user", date: "2026-11-12", time: "07:30" }));

    const result = await service.clear(PARENT, ALERT_EVENT);

    expect(result.isSuccess).toBe(true);
    expect(saved()?.get("origin").value).toBe("default");
    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-13", "18:00"));
  });
});

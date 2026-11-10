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
import { ALERT_EVENT, existingAlert, PARENT, paris } from "../testing/alert.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");

let alerts: PortMock<IAlertRepository>;
let deadlines: PortMock<IEventDeadlines>;
let outbox: PortMock<IOutboxRepository>;
let service: AlertPlanningService;

function deadlineOn(deadlineDate: string, deadlineTime?: string): EventDeadline {
  return { deadlineAt: paris(deadlineDate, deadlineTime ?? "23:59"), deadlineDate, deadlineTime };
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

const planned = { eventId: ALERT_EVENT, userId: PARENT };

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

  it("given an alert already sent, then it is never sent twice", async () => {
    givenAlert(existingAlert({ status: "sent" }));

    await service.planDefault(planned);

    expect(alerts.save).not.toHaveBeenCalled();
  });
});

describe("replan", () => {
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
  });

  it("given a default alert, when the deadline moves, then the default time follows it", async () => {
    givenAlert(existingAlert({ origin: "default", date: "2026-11-13", time: "18:00" }));
    givenEvent(deadlineOn("2026-11-25"));

    await service.replan(planned);

    expect(saved()?.get("time").value.at).toEqual(paris("2026-11-23", "18:00"));
    expect(saved()?.get("status").value).toBe("pending");
  });
});

describe("cancel", () => {
  it("given a pending alert, then it becomes skipped", async () => {
    givenAlert(existingAlert({ status: "pending" }));

    const result = await service.cancel(ALERT_EVENT);

    expect(result.isSuccess).toBe(true);
    expect(saved()?.get("status").value).toBe("skipped");
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

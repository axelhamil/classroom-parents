import { describe, expect, it } from "bun:test";
import type { EventDeadlineDto } from "@modules/agenda/application/dto/event.dto";
import type { AgendaError } from "@modules/agenda/application/ports/event-repository.port";
import type { ChildrenError } from "@modules/children/application/ports/child-repository.port";
import { Option, Result } from "@packages/ddd-kit";
import { childOwnershipFor, eventDeadlinesFor } from "../bindings";

const FAMILY_A = "parent-a";
const FAMILY_B = "parent-b";
const LEA = "0196a000-0000-7000-8000-00000000000a";

const children = {
  isOwnedBy: async (userId: string, childId: string) =>
    Result.ok<boolean, ChildrenError>(userId === FAMILY_A && childId === LEA),
};

describe("agenda IChildOwnership bound to children", () => {
  it("answers owned for the parent's own child", async () => {
    const result = await childOwnershipFor(children).isOwnedBy(FAMILY_A, LEA);

    expect(result.getValue()).toBe(true);
  });

  it("answers not owned when another family names that child", async () => {
    const result = await childOwnershipFor(children).isOwnedBy(FAMILY_B, LEA);

    expect(result.getValue()).toBe(false);
  });

  it("passes a children failure through with its code", async () => {
    const failing = {
      isOwnedBy: async () =>
        Result.fail<boolean, ChildrenError>({ code: "CHILD_PROVIDER_FAILURE", message: "down" }),
    };

    const result = await childOwnershipFor(failing).isOwnedBy(FAMILY_A, LEA);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("alerts IEventDeadlines bound to the agenda", () => {
  const EXAM = "0196a000-0000-7000-8000-0000000000e1";
  const deadline = {
    deadlineAt: new Date("2026-11-19T07:30:00.000Z"),
    deadlineDate: "2026-11-19",
    deadlineTime: "08:30",
  };

  it("passes every deadline field of the parent's own alertable event", async () => {
    const agenda = {
      alertDeadline: async (userId: string, eventId: string) =>
        Result.ok<Option<EventDeadlineDto>, AgendaError>(
          userId === FAMILY_A && eventId === EXAM ? Option.some(deadline) : Option.none(),
        ),
    };

    const result = await eventDeadlinesFor(agenda).forUser(FAMILY_A, EXAM);

    expect(result.getValue().toUndefined()).toEqual(deadline);
  });

  it("answers none when the agenda hides the event from that family", async () => {
    const agenda = {
      alertDeadline: async () => Result.ok<Option<EventDeadlineDto>, AgendaError>(Option.none()),
    };

    const result = await eventDeadlinesFor(agenda).forUser(FAMILY_B, EXAM);

    expect(result.getValue().isNone()).toBe(true);
  });

  it("passes an agenda failure through with its code", async () => {
    const agenda = {
      alertDeadline: async () =>
        Result.fail<Option<EventDeadlineDto>, AgendaError>({
          code: "EVENT_PROVIDER_FAILURE",
          message: "down",
        }),
    };

    const result = await eventDeadlinesFor(agenda).forUser(FAMILY_A, EXAM);

    expect(result.getError().code).toBe("EVENT_PROVIDER_FAILURE");
  });
});

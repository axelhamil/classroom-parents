import { describe, expect, it } from "vitest";
import { EventTypes } from "../event-types";
import { emittedPayloadSchema, PayloadByEventType } from "../payloads";

const child = { userId: "u1", childId: "c1" };

describe("children events", () => {
  it("CHILD_CONNECTED queued before the actor was recorded reads as a system action", () => {
    const parsed = PayloadByEventType[EventTypes.CHILD_CONNECTED].safeParse(child);

    expect(parsed.data).toEqual({ ...child, actorUserId: null });
  });

  it("CHILD_CONNECTED cannot be emitted without naming its actor, null for the system", () => {
    const schema = emittedPayloadSchema(EventTypes.CHILD_CONNECTED);

    expect(schema?.safeParse(child).success).toBe(false);
    expect(schema?.safeParse({ ...child, actorUserId: null }).success).toBe(true);
    expect(schema?.safeParse({ ...child, actorUserId: "u1" }).success).toBe(true);
  });
});

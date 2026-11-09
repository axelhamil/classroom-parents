import { describe, expect, it } from "vitest";
import { EventTypes } from "../event-types";
import { PayloadByEventType } from "../payloads";

describe("email events", () => {
  it("email.delivery.exhausted lets a system delivery carry a null actor explicitly", () => {
    const schema = PayloadByEventType[EventTypes.EMAIL_DELIVERY_EXHAUSTED];
    const exhausted = {
      messageId: "m1",
      template: null,
      attempts: 5,
      lastError: "boom",
    };

    expect(schema.safeParse({ ...exhausted, actorUserId: null }).success).toBe(true);
    expect(schema.safeParse(exhausted).success).toBe(false);
  });

  it("email.delivery.exhausted carries no recipient identifier", () => {
    const schema = PayloadByEventType[EventTypes.EMAIL_DELIVERY_EXHAUSTED];

    expect(Object.keys(schema.shape)).not.toContain("toHash");
  });
});

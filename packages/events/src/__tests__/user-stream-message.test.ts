import { describe, expect, it } from "vitest";
import { UserStreamMessage } from "../user-stream-message";

describe("UserStreamMessage", () => {
  it("accepts each message the stream may carry", () => {
    expect(UserStreamMessage.safeParse({ type: "events.changed" }).success).toBe(true);
    expect(UserStreamMessage.safeParse({ type: "children.changed" }).success).toBe(true);
    expect(UserStreamMessage.safeParse({ type: "sync.finished", childId: "c1" }).success).toBe(
      true,
    );
  });

  it("refuses a finished sync that names no child and an unknown type", () => {
    expect(UserStreamMessage.safeParse({ type: "sync.finished" }).success).toBe(false);
    expect(UserStreamMessage.safeParse({ type: "notification" }).success).toBe(false);
  });
});

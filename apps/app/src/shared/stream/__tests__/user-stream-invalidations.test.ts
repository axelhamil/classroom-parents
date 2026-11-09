import { invalidationsFor } from "@packages/web-kit/stream/use-user-stream";
import { describe, expect, it } from "vitest";
import { parseUserStreamMessage, USER_STREAM_INVALIDATIONS } from "../user-stream-invalidations";

function invalidated(data: string) {
  return invalidationsFor(data, parseUserStreamMessage, USER_STREAM_INVALIDATIONS);
}

describe("user stream invalidations", () => {
  it("given events.changed, then only the events queries are invalidated", () => {
    expect(invalidated('{"type":"events.changed"}')).toEqual([["events"]]);
  });

  it("given children.changed, then only the children queries are invalidated", () => {
    expect(invalidated('{"type":"children.changed"}')).toEqual([["children"]]);
  });

  it("given sync.finished, then events and children are both invalidated", () => {
    expect(invalidated('{"type":"sync.finished","childId":"c1"}')).toEqual([
      ["events"],
      ["children"],
    ]);
  });

  it("given sync.finished without its child, then nothing is invalidated", () => {
    expect(invalidated('{"type":"sync.finished"}')).toEqual([]);
  });
});

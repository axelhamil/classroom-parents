import { describe, expect, it } from "vitest";
import { ALL_EVENT_TYPES, EventTypes } from "../event-types";
import { retentionFor } from "../retention-map";
import { isPublicEvent, VISIBILITY } from "../visibility-map";

describe("event visibility and retention", () => {
  it("classifies every event in the catalog", () => {
    for (const type of ALL_EVENT_TYPES) expect(VISIBILITY[type]).toBeDefined();
  });

  it("keeps security events internal", () => {
    expect(isPublicEvent(EventTypes.SECURITY_CSRF_REJECTED)).toBe(false);
    expect(isPublicEvent(EventTypes.USER_DELETED)).toBe(true);
  });

  it("gives no retention policy to an unknown type", () => {
    expect(retentionFor("not.a.real.event")).toBe("none");
    expect(retentionFor(EventTypes.USER_DELETED)).toBe("compliance");
  });
});

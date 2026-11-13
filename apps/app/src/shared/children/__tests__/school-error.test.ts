import { describe, expect, it } from "vitest";
import type { ChildDto } from "../../../shared/api/queries/children";
import { classifySchoolError } from "../school-error";

function child(status: ChildDto["status"]): ChildDto {
  return {
    id: "8a7c2f4e-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
    label: "Léa",
    color: 1,
    avatarUrl: null,
    googleEmail: "lea@college.example",
    status,
    syncing: false,
  };
}

describe("classifySchoolError", () => {
  it("given Google refused with access_denied, then it is an access denial", () => {
    expect(classifySchoolError(new URLSearchParams("error=access_denied"))).toBe("access_denied");
  });

  it("given a description naming admin_policy_enforced, then the school administrator blocked the app", () => {
    const params = new URLSearchParams({
      error: "access_denied",
      error_description: "Error 400: admin_policy_enforced",
    });

    expect(classifySchoolError(params)).toBe("admin_blocked");
  });

  it("given access_not_configured, then the school has not configured the app yet", () => {
    expect(classifySchoolError(new URLSearchParams("error=access_not_configured"))).toBe(
      "not_configured",
    );
  });

  it("given a child the school blocks, then it shows the school block", () => {
    expect(classifySchoolError(child("blocked_by_school"))).toBe("admin_blocked");
  });

  it("given the Google account is linked to another parent of the app, then it is an existing link, not a school block", () => {
    expect(
      classifySchoolError(new URLSearchParams("error=account_already_linked_to_different_user")),
    ).toBe("already_linked");
  });

  it("given the app could not link the Google account, then it is a refused link, not a school block", () => {
    expect(classifySchoolError(new URLSearchParams("error=unable_to_link_account"))).toBe(
      "link_refused",
    );
  });

  it("given nothing recognisable, then the cause is unknown", () => {
    expect(classifySchoolError(new URLSearchParams("error=server_error"))).toBe("unknown");
    expect(classifySchoolError(new URLSearchParams())).toBe("unknown");
    expect(classifySchoolError(child("connected"))).toBe("unknown");
  });
});

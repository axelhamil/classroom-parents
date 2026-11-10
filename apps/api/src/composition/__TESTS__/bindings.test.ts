import { describe, expect, it } from "bun:test";
import type { ChildrenError } from "@modules/children/application/ports/child-repository.port";
import { Result } from "@packages/ddd-kit";
import { childOwnershipFor } from "../bindings";

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

import { describe, expect, it } from "vitest";
import { SUB_PROCESSOR_KEYS } from "../../../shared/sub-processor-labels";
import { SUB_PROCESSORS } from "../../../shared/sub-processors.config";

describe("SUB_PROCESSOR_KEYS", () => {
  // `satisfies Record<SubProcessorId, …>` proves every id has a pair of keys.
  // It cannot prove Resend's row points at Resend's copy; swapping two entries
  // type-checks and renders. Only naming each pair catches that.
  it("points each processor at its own purpose and region keys", () => {
    expect(SUB_PROCESSOR_KEYS).toStrictEqual({
      google: {
        purpose: "legal.subProcessors.google.purpose",
        region: "legal.subProcessors.google.region",
      },
      anthropic: {
        purpose: "legal.subProcessors.anthropic.purpose",
        region: "legal.subProcessors.anthropic.region",
      },
      resend: {
        purpose: "legal.subProcessors.resend.purpose",
        region: "legal.subProcessors.resend.region",
      },
      railway: {
        purpose: "legal.subProcessors.railway.purpose",
        region: "legal.subProcessors.railway.region",
      },
    });
  });

  // The register and the key map are two files that must gain entries together.
  // A vendor added to the register with no keys would render blank cells.
  it("covers every processor in the register, with no orphan entry", () => {
    expect(Object.keys(SUB_PROCESSOR_KEYS).toSorted()).toEqual(
      SUB_PROCESSORS.map((sp) => sp.id).toSorted(),
    );
  });
});

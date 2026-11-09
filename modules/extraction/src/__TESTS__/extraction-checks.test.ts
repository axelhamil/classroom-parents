import { describe, expect, it } from "bun:test";
import { reviewReasonsFor } from "../application/services/extraction-checks";
import type { ExtractedCandidate } from "../application/services/extraction-output.schema";

const SOURCE = "Sortie au musée  JEUDI 19 novembre, autorisation à rendre avant les vacances.";

function candidate(overrides: Partial<ExtractedCandidate>): ExtractedCandidate {
  return {
    title: "Sortie au musée",
    description: "Prévoir un pique-nique.",
    category: "school_trip",
    deadlineDate: "2026-11-19",
    deadlineTime: null,
    confidence: "high",
    dateExpression: "jeudi 19 novembre",
    evidenceQuote: "sortie au musee jeudi 19 Novembre",
    ...overrides,
  };
}

function reasons(overrides: Partial<ExtractedCandidate>) {
  return reviewReasonsFor(candidate(overrides), { source: SOURCE, publishedOn: "2026-11-09" });
}

describe("reviewReasonsFor", () => {
  it("accepts quotes that differ from the source only by spacing, case and accents", () => {
    expect(reasons({})).toEqual([]);
  });

  it("flags a quote or a date expression absent from the announcement", () => {
    expect(reasons({ evidenceQuote: "Sortie au zoo jeudi" })).toEqual(["quote_not_in_text"]);
    expect(reasons({ dateExpression: "mardi 17 novembre", deadlineDate: "2026-11-17" })).toEqual([
      "quote_not_in_text",
    ]);
  });

  it("accepts the deadline on the publication day and 400 days later, not 401", () => {
    const sameDay = { dateExpression: "", evidenceQuote: "Sortie au musée" };

    expect(reasons({ ...sameDay, deadlineDate: "2026-11-09" })).toEqual([]);
    expect(reasons({ ...sameDay, deadlineDate: "2027-12-14" })).toEqual([]);
    expect(reasons({ ...sameDay, deadlineDate: "2027-12-15" })).toEqual(["date_too_far"]);
  });

  it("flags a date relative to the holidays, which the extraction cannot resolve", () => {
    expect(
      reasons({
        category: "document_due",
        deadlineDate: "2026-12-18",
        dateExpression: "avant les vacances",
        evidenceQuote: "autorisation à rendre avant les vacances",
      }),
    ).toEqual(["relative_holiday"]);
  });

  it("flags a low confidence", () => {
    expect(reasons({ confidence: "low" })).toEqual(["low_confidence"]);
  });
});

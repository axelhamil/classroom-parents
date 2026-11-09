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
    const sameDay = { dateExpression: "Sortie au musée", evidenceQuote: "Sortie au musée" };

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

  describe("consistency of the deadline with the written day", () => {
    const text = "Évaluation de maths jeudi 19 novembre";
    const check = (overrides: Partial<ExtractedCandidate>, source = text) =>
      reviewReasonsFor(candidate({ evidenceQuote: source, ...overrides }), {
        source,
        publishedOn: "2026-11-09",
      });

    it("flags a deadline that is not the day the announcement writes", () => {
      expect(check({ dateExpression: "19 novembre", deadlineDate: "2026-11-20" })).toEqual([
        "weekday_mismatch",
      ]);
      expect(check({ dateExpression: "19 novembre", deadlineDate: "2026-11-26" })).toEqual([
        "weekday_mismatch",
      ]);
    });

    it("flags a deadline whose weekday contradicts the weekday written next to its day", () => {
      const teacherSlip = "Contrôle jeudi 20 novembre";

      expect(
        check({ dateExpression: "20 novembre", deadlineDate: "2026-11-20" }, teacherSlip),
      ).toEqual(["weekday_mismatch"]);
    });

    it("flags an event whose date expression is empty", () => {
      expect(check({ dateExpression: "", deadlineDate: "2026-11-20" })).toContain(
        "quote_not_in_text",
      );
    });
  });

  it("flags a past date the model pushed to the next year", () => {
    const source = "Fiche à rendre pour le 6 novembre";

    expect(
      reviewReasonsFor(
        candidate({
          category: "document_due",
          deadlineDate: "2027-11-06",
          dateExpression: "le 6 novembre",
          evidenceQuote: source,
        }),
        { source, publishedOn: "2026-11-09" },
      ),
    ).toEqual(["date_before_publication"]);
  });

  it("matches a quote whatever the quotation marks", () => {
    const source = "Le « contrôle » de jeudi 19 novembre";

    expect(
      reviewReasonsFor(candidate({ evidenceQuote: 'Le "contrôle" de jeudi 19 novembre' }), {
        source,
        publishedOn: "2026-11-09",
      }),
    ).toEqual([]);
  });
});

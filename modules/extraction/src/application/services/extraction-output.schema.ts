import { z } from "zod";
import { AMENDMENT_KINDS } from "../../domain/extracted-event";
import { extractionCategorySchema } from "../../domain/value-objects/extraction-category.vo";

const extractedCandidateSchema = z.object({
  title: z.string().describe("French noun phrase, at most 80 characters, no person name"),
  description: z
    .string()
    .describe("French, one or two sentences on what to do or prepare, at most 300 characters"),
  category: extractionCategorySchema,
  deadlineDate: z.iso.date().describe("YYYY-MM-DD, Europe/Paris calendar day"),
  deadlineTime: z
    .string()
    .nullable()
    .describe("HH:mm on 24 hours, only when written in the announcement, else null"),
  confidence: z.enum(["high", "medium", "low"]),
  dateExpression: z.string().describe("Verbatim words of the announcement that fix the date"),
  evidenceQuote: z.string().describe("Verbatim sentence of the announcement supporting the event"),
});

const amendmentCandidateSchema = z.object({
  kind: z.enum(AMENDMENT_KINDS),
  reference: z
    .string()
    .describe("French noun phrase naming the earlier deadline as its title would read"),
  referenceDate: z.iso
    .date()
    .nullable()
    .describe(
      "YYYY-MM-DD of the earlier deadline, only when written in the announcement, else null",
    ),
});

export const extractionOutputSchema = z.object({
  events: z.array(extractedCandidateSchema),
  amends: z.array(amendmentCandidateSchema),
});

export type ExtractedCandidate = z.infer<typeof extractedCandidateSchema>;
export type AmendmentCandidate = z.infer<typeof amendmentCandidateSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

import { z } from "zod";
import { extractionCategorySchema } from "../../domain/value-objects/extraction-category.vo";

const extractedCandidateSchema = z.object({
  title: z.string().describe("French noun phrase, at most 80 characters, no person name"),
  description: z
    .string()
    .describe("French, one or two sentences on what to do or prepare, at most 300 characters"),
  category: extractionCategorySchema,
  deadlineDate: z.iso.date().describe("YYYY-MM-DD, Europe/Paris calendar day"),
  deadlineTime: z.iso
    .time({ precision: -1 })
    .nullable()
    .describe("HH:mm 24h, only when written in the announcement, else null"),
  confidence: z.enum(["high", "medium", "low"]),
  dateExpression: z.string().describe("Verbatim words of the announcement that fix the date"),
  evidenceQuote: z.string().describe("Verbatim sentence of the announcement supporting the event"),
});

export const extractionOutputSchema = z.object({ events: z.array(extractedCandidateSchema) });

export type ExtractedCandidate = z.infer<typeof extractedCandidateSchema>;
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;

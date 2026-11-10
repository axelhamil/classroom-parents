import { Result, ValueObject } from "@packages/ddd-kit";
import { EVENT_CATEGORIES } from "@packages/events/agenda-contract";
import { z } from "zod";

export const extractionCategorySchema = z.enum(EVENT_CATEGORIES);

export type ExtractionCategoryValue = z.infer<typeof extractionCategorySchema>;

const FRENCH_LABELS = {
  assessment: "Évaluation",
  homework: "Devoir",
  school_trip: "Sortie scolaire",
  swimming: "Piscine",
  document_due: "Document à rendre",
} as const satisfies Record<ExtractionCategoryValue, string>;

export class ExtractionCategory extends ValueObject<ExtractionCategoryValue> {
  protected validate(value: ExtractionCategoryValue): Result<ExtractionCategoryValue> {
    const parsed = extractionCategorySchema.safeParse(value);
    if (!parsed.success) return Result.fail(`Unknown extraction category: ${String(value)}`);

    return Result.ok(parsed.data);
  }

  label(): string {
    return FRENCH_LABELS[this.value];
  }
}

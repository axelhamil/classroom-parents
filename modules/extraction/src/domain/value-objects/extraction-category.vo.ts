import { Result, ValueObject } from "@packages/ddd-kit";
import { CLASSROOM_CATEGORIES } from "@packages/events/agenda-contract";
import { z } from "zod";
import type { ReaderLocale } from "../reader";

export const extractionCategorySchema = z.enum(CLASSROOM_CATEGORIES);

export type ExtractionCategoryValue = z.infer<typeof extractionCategorySchema>;

const LABELS = {
  fr: {
    assessment: "Évaluation",
    homework: "Devoir",
    school_trip: "Sortie scolaire",
    swimming: "Piscine",
    document_due: "Document à rendre",
  },
  en: {
    assessment: "Assessment",
    homework: "Homework",
    school_trip: "School trip",
    swimming: "Swimming",
    document_due: "Document to return",
  },
  es: {
    assessment: "Evaluación",
    homework: "Deberes",
    school_trip: "Salida escolar",
    swimming: "Piscina",
    document_due: "Documento para entregar",
  },
  pt: {
    assessment: "Avaliação",
    homework: "Trabalho de casa",
    school_trip: "Visita de estudo",
    swimming: "Natação",
    document_due: "Documento a entregar",
  },
  ar: {
    assessment: "تقييم",
    homework: "واجب منزلي",
    school_trip: "خرجة مدرسية",
    swimming: "سباحة",
    document_due: "وثيقة للإرجاع",
  },
} as const satisfies Record<ReaderLocale, Record<ExtractionCategoryValue, string>>;

export class ExtractionCategory extends ValueObject<ExtractionCategoryValue> {
  protected validate(value: ExtractionCategoryValue): Result<ExtractionCategoryValue> {
    const parsed = extractionCategorySchema.safeParse(value);
    if (!parsed.success) return Result.fail(`Unknown extraction category: ${String(value)}`);

    return Result.ok(parsed.data);
  }

  label(locale: ReaderLocale): string {
    return LABELS[locale][this.value];
  }
}

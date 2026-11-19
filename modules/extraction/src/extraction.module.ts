import type { IInstrumentation } from "@packages/ddd-kit";
import type { ILanguageModel } from "@packages/llm/contract/language-model.port";
import { defineModule } from "inwire";
import type { IExtractionCache } from "./application/ports/extraction-cache.port";
import { ExtractionService } from "./application/services/extraction.service";
import { DrizzleExtractionCache } from "./infrastructure/repositories/drizzle-extraction-cache";

export interface ExtractionPrerequisites {
  IInstrumentation: IInstrumentation;
  ILanguageModel: ILanguageModel;
}

export const extractionModule = defineModule<ExtractionPrerequisites>()((b) =>
  b
    .add(
      "IExtractionCache",
      (c): IExtractionCache => new DrizzleExtractionCache(c.IInstrumentation),
    )
    .add(
      "ExtractionService",
      (c) => new ExtractionService(c.ILanguageModel, c.IExtractionCache, c.IInstrumentation),
    ),
);

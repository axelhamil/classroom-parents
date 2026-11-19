import type { IInstrumentation } from "@packages/ddd-kit";
import type { ILanguageModel } from "@packages/llm/contract/language-model.port";
import { defineModule } from "inwire";
import { ExtractionService } from "./application/services/extraction.service";

export interface ExtractionPrerequisites {
  IInstrumentation: IInstrumentation;
  ILanguageModel: ILanguageModel;
}

export const extractionModule = defineModule<ExtractionPrerequisites>()((b) =>
  b.add("ExtractionService", (c) => new ExtractionService(c.ILanguageModel, c.IInstrumentation)),
);

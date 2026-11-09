import Anthropic from "@anthropic-ai/sdk";
import type { IInstrumentation } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { ILanguageModel } from "./application/ports/language-model.port";
import { ExtractionService } from "./application/services/extraction.service";
import { AnthropicLanguageModel } from "./infrastructure/adapters/anthropic-language-model";

export interface ExtractionSettings {
  anthropicApiKey: string;
}

export interface ExtractionPrerequisites {
  IInstrumentation: IInstrumentation;
  extractionSettings: ExtractionSettings;
}

export const extractionModule = defineModule<ExtractionPrerequisites>()((b) =>
  b
    .add(
      "ILanguageModel",
      (c): ILanguageModel =>
        new AnthropicLanguageModel(
          new Anthropic({ apiKey: c.extractionSettings.anthropicApiKey }),
          c.IInstrumentation,
        ),
    )
    .add("ExtractionService", (c) => new ExtractionService(c.ILanguageModel, c.IInstrumentation)),
);

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  ExtractionError,
  ILanguageModel,
  LanguageModelRequest,
  ModelTier,
} from "../../application/ports/language-model.port";

const MODEL_BY_TIER = {
  fast: "claude-haiku-5-5",
  strong: "claude-sonnet-5-5",
} as const satisfies Record<ModelTier, string>;

const EFFORT_BY_TIER = {
  fast: "low",
  strong: "high",
} as const satisfies Record<ModelTier, "low" | "medium" | "high">;

const MAX_OUTPUT_TOKENS = 16_000;

const RATE_LIMITED: ExtractionError = {
  code: "EXTRACTION_RATE_LIMITED",
  message: "Le service d'extraction est saturé, l'annonce sera relue au prochain passage.",
};
const PROVIDER_FAILURE: ExtractionError = {
  code: "EXTRACTION_PROVIDER_FAILURE",
  message: "Le service d'extraction n'a pas répondu, l'annonce sera relue au prochain passage.",
};
const OUTPUT_INVALID: ExtractionError = {
  code: "EXTRACTION_OUTPUT_INVALID",
  message:
    "La réponse du service d'extraction était illisible, l'annonce sera relue au prochain passage.",
};

class OutputRejected extends Error {
  constructor(readonly reason: string) {
    super(`structured output rejected: ${reason}`);
    this.name = "OutputRejected";
  }
}

function errorFor(error: unknown): ExtractionError {
  if (error instanceof Anthropic.RateLimitError) return RATE_LIMITED;
  if (error instanceof Anthropic.APIError) return PROVIDER_FAILURE;
  if (error instanceof OutputRejected && error.reason === "refusal") return PROVIDER_FAILURE;
  if (error instanceof OutputRejected || error instanceof Anthropic.AnthropicError)
    return OUTPUT_INVALID;

  return PROVIDER_FAILURE;
}

function reportable(error: unknown): unknown {
  if (error instanceof Anthropic.APIError || error instanceof OutputRejected) return error;
  if (error instanceof Anthropic.AnthropicError) return new OutputRejected("schema or JSON parse");

  return error;
}

export class AnthropicLanguageModel implements ILanguageModel {
  constructor(
    private readonly client: Anthropic,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async parse<T>(request: LanguageModelRequest<T>): Promise<Result<T, ExtractionError>> {
    const model = MODEL_BY_TIER[request.tier];

    return this.instrumentation.startSpan(
      { name: "AnthropicLanguageModel > parse", attributes: { tier: request.tier, model } },
      async () => {
        try {
          const response = await this.instrumentation.startSpan(
            { name: "anthropic.messages.parse", op: "http.client", attributes: { model } },
            () =>
              this.client.messages.parse({
                model,
                max_tokens: MAX_OUTPUT_TOKENS,
                system: [
                  { type: "text", text: request.system, cache_control: { type: "ephemeral" } },
                ],
                messages: [{ role: "user", content: request.user }],
                output_config: {
                  effort: EFFORT_BY_TIER[request.tier],
                  format: zodOutputFormat(request.schema),
                },
              }),
          );

          this.instrumentation.setSpanAttributes({
            "llm.input_tokens": response.usage.input_tokens,
            "llm.output_tokens": response.usage.output_tokens,
            "llm.cache_read_input_tokens": response.usage.cache_read_input_tokens ?? 0,
            "llm.cache_creation_input_tokens": response.usage.cache_creation_input_tokens ?? 0,
          });

          if (response.stop_reason === "refusal") throw new OutputRejected("refusal");
          if (response.parsed_output === null)
            throw new OutputRejected(String(response.stop_reason));

          return Result.ok(response.parsed_output);
        } catch (error) {
          this.instrumentation.capture(reportable(error), {
            metadata: { tier: request.tier, model },
          });

          return Result.fail(errorFor(error));
        }
      },
    );
  }
}

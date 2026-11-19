import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type { ContentPart, LlmRequest, LlmStreamObserver } from "../contract/language-model.port";
import { type LlmError, llmError } from "../contract/llm-error";
import { contextBlock, dataTags, fencedText, newNonce, withoutFenceTags } from "./data-fence";
import type { ILanguageModelProvider, LlmCall } from "./language-model-provider.port";
import { DEFAULT_EFFORT_BY_TIER, MODEL_BY_TIER, type ModelId, type TokenUsage } from "./models";

const RATE_LIMITED = llmError("LLM_RATE_LIMITED", "The model provider is rate limiting us.");
const PROVIDER_FAILURE = llmError("LLM_PROVIDER_FAILURE", "The model provider did not answer.");
const ABORTED = llmError("LLM_PROVIDER_FAILURE", "The caller aborted the call.", { aborted: true });
const OUTPUT_INVALID = llmError("LLM_OUTPUT_INVALID", "The model answer did not match the schema.");
const INPUT_REJECTED = llmError("LLM_INPUT_INVALID", "The model provider rejected the request.");

class OutputRejected extends Error {
  constructor(readonly reason: string) {
    super(`structured output rejected: ${reason}`);
    this.name = "OutputRejected";
  }
}

interface ProviderUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

interface ParsedResponse<T> {
  stop_reason: string | null;
  parsed_output: T | null;
  usage: ProviderUsage;
}

function errorFor(error: unknown): LlmError {
  if (error instanceof Anthropic.APIUserAbortError) return ABORTED;
  if (error instanceof Anthropic.RateLimitError) return RATE_LIMITED;
  if (error instanceof Anthropic.BadRequestError) return INPUT_REJECTED;
  if (error instanceof Anthropic.UnprocessableEntityError) return INPUT_REJECTED;
  if (error instanceof Anthropic.APIError) return PROVIDER_FAILURE;
  if (error instanceof Anthropic.AnthropicError) return OUTPUT_INVALID;

  return PROVIDER_FAILURE;
}

function reportable(error: unknown): unknown {
  if (error instanceof Anthropic.APIError) return error;
  if (error instanceof Anthropic.AnthropicError) return new OutputRejected("schema or JSON parse");

  return error;
}

function tokenUsage(usage: ProviderUsage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function partBlock(part: ContentPart): Anthropic.ContentBlockParam {
  if (part.kind === "text") return { type: "text", text: withoutFenceTags(part.text) };
  if (part.kind === "image")
    return {
      type: "image",
      source: { type: "base64", media_type: part.mediaType, data: part.base64 },
    };

  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: part.base64 },
  };
}

function userContent<T>(
  request: LlmRequest<T>,
  nonce: string,
): string | Anthropic.ContentBlockParam[] {
  const context = contextBlock(request.context, nonce);
  if (typeof request.data === "string") return `${context}\n${fencedText(request.data, nonce)}`;

  const { open, close } = dataTags(nonce);

  return [
    { type: "text", text: `${context}\n${open}` },
    ...request.data.map(partBlock),
    { type: "text", text: close },
  ];
}

function paramsFor<T>(request: LlmRequest<T>, model: ModelId, nonce: string) {
  return {
    model,
    max_tokens: request.maxOutputTokens,
    system: [
      {
        type: "text" as const,
        text: request.system,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user" as const, content: userContent(request, nonce) }],
    output_config: {
      effort: request.effort ?? DEFAULT_EFFORT_BY_TIER[request.tier],
      format: zodOutputFormat(request.schema),
    },
  };
}

type MessageParams<T> = ReturnType<typeof paramsFor<T>>;

/**
 * The Anthropic adapter. Instructions go in `system` only, as the one cached block; facts and
 * third-party content go in the user turn, the content fenced by a fresh nonce on every call.
 * Structured outputs are the only answer format, and the Zod schema parses them a second time.
 */
export class AnthropicLanguageModel implements ILanguageModelProvider {
  constructor(
    private readonly client: Anthropic,
    private readonly instrumentation: IInstrumentation,
    private readonly nonces: () => string = newNonce,
  ) {}

  parse<T>(request: LlmRequest<T>): Promise<LlmCall<T>> {
    return this.call(request, "anthropic.messages.parse", (params) =>
      this.client.messages.parse(params),
    );
  }

  streamParse<T>(request: LlmRequest<T>, observer: LlmStreamObserver): Promise<LlmCall<T>> {
    return this.call(request, "anthropic.messages.stream", (params) => {
      const stream = this.client.messages.stream(params, { signal: observer.signal });
      stream.on("text", (_delta, snapshot) => observer.onPartialJson(snapshot));

      return stream.finalMessage();
    });
  }

  private call<T>(
    request: LlmRequest<T>,
    operation: string,
    send: (params: MessageParams<T>) => Promise<ParsedResponse<T>>,
  ): Promise<LlmCall<T>> {
    const model = MODEL_BY_TIER[request.tier];
    const attributes = { tier: request.tier, model, feature: request.feature };

    return this.instrumentation.startSpan(
      { name: "AnthropicLanguageModel > call", attributes },
      async () => {
        try {
          const response = await this.instrumentation.startSpan(
            { name: operation, op: "http.client", attributes: { model } },
            () => send(paramsFor(request, model, this.nonces())),
          );
          const usage = tokenUsage(response.usage);
          this.recordUsage(usage);

          return { model, usage: Option.some(usage), result: this.outputOf(response, attributes) };
        } catch (error) {
          const failure = errorFor(error);
          if (failure !== ABORTED)
            this.instrumentation.capture(reportable(error), { metadata: attributes });

          return { model, usage: Option.none(), result: Result.fail(failure) };
        }
      },
    );
  }

  private outputOf<T>(
    response: ParsedResponse<T>,
    attributes: Record<string, string>,
  ): Result<T, LlmError> {
    if (response.stop_reason !== "refusal" && response.parsed_output !== null)
      return Result.ok(response.parsed_output);

    const rejection = new OutputRejected(String(response.stop_reason));
    this.instrumentation.capture(rejection, { metadata: attributes });
    return Result.fail(OUTPUT_INVALID);
  }

  private recordUsage(usage: TokenUsage): void {
    this.instrumentation.setSpanAttributes({
      "llm.input_tokens": usage.inputTokens,
      "llm.output_tokens": usage.outputTokens,
      "llm.cache_read_input_tokens": usage.cacheReadTokens,
      "llm.cache_creation_input_tokens": usage.cacheWriteTokens,
    });
  }
}

/** Settings of the production provider; the key never leaves the server. */
export interface AnthropicSettings {
  apiKey: string;
  timeoutMs: number;
}

/** Builds the adapter around its SDK client, so no other package depends on the SDK. */
export function anthropicLanguageModel(
  settings: AnthropicSettings,
  instrumentation: IInstrumentation,
): AnthropicLanguageModel {
  const client = new Anthropic({ apiKey: settings.apiKey, timeout: settings.timeoutMs });

  return new AnthropicLanguageModel(client, instrumentation);
}

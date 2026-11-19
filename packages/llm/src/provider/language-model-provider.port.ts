import type { Option, Result } from "@packages/ddd-kit";
import type { LlmRequest, LlmStreamObserver } from "../contract/language-model.port";
import type { LlmError } from "../contract/llm-error";
import type { ModelId, TokenUsage } from "./models";

/**
 * One call as the provider saw it: the outcome, the model that answered and the tokens it
 * billed, known only when a response arrived (a refusal or an unreadable answer still costs).
 */
export interface LlmCall<T> {
  result: Result<T, LlmError>;
  model: ModelId;
  usage: Option<TokenUsage>;
}

/**
 * What a provider adapter implements. `MeteredLanguageModel` turns it into the
 * `ILanguageModel` modules consume, so the usage never leaks into business code.
 */
export interface ILanguageModelProvider {
  parse<T>(request: LlmRequest<T>): Promise<LlmCall<T>>;
  streamParse<T>(request: LlmRequest<T>, observer: LlmStreamObserver): Promise<LlmCall<T>>;
}

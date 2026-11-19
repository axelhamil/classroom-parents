import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  ILanguageModel,
  LlmRequest,
  LlmStreamObserver,
} from "../contract/language-model.port";
import { isProviderOutage, type LlmError, llmError } from "../contract/llm-error";

/** 5 outages within 60 s open the circuit for 2 min (spec §4.3). */
export interface CircuitBreakerSettings {
  failureThreshold: number;
  windowMs: number;
  openMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerSettings = {
  failureThreshold: 5,
  windowMs: 60_000,
  openMs: 120_000,
};

const OPEN = llmError(
  "LLM_PROVIDER_FAILURE",
  "The model provider is paused after repeated failures.",
  {
    circuit: "open",
  },
);

/**
 * Stops calling a provider that keeps failing, so an outage costs neither latency nor
 * retries; the first call after the pause probes it, and one more outage reopens it at once. Only outages count: a refused
 * request or an unreadable answer says nothing about the provider's health. The state lives
 * in the instance, so each process or function instance trips on its own.
 */
export class CircuitBreakerLanguageModel implements ILanguageModel {
  private failures: number[] = [];
  private openUntil = 0;

  constructor(
    private readonly inner: ILanguageModel,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: CircuitBreakerSettings = DEFAULT_CIRCUIT_BREAKER,
    private readonly now: () => number = Date.now,
  ) {}

  parse<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>> {
    return this.guarded(() => this.inner.parse(request));
  }

  streamParse<T>(
    request: LlmRequest<T>,
    observer: LlmStreamObserver,
  ): Promise<Result<T, LlmError>> {
    return this.guarded(() => this.inner.streamParse(request, observer));
  }

  private async guarded<T>(call: () => Promise<Result<T, LlmError>>): Promise<Result<T, LlmError>> {
    if (this.now() < this.openUntil) return Result.fail(OPEN);

    const probing = this.openUntil > 0;
    const result = await call();
    const outage = result.isFailure && isProviderOutage(result.getError());

    if (outage && probing) this.open();
    if (outage && !probing) this.recordOutage();
    if (!outage && probing) this.openUntil = 0;

    return result;
  }

  private recordOutage(): void {
    const now = this.now();
    this.failures = [...this.failures.filter((at) => now - at < this.settings.windowMs), now];
    if (this.failures.length >= this.settings.failureThreshold) this.open();
  }

  private open(): void {
    this.failures = [];
    this.openUntil = this.now() + this.settings.openMs;
    this.instrumentation.addBreadcrumb({
      category: "llm",
      message: "model provider circuit opened",
      level: "warning",
    });
  }
}

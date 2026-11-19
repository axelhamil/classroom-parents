# llm rules

The model kit: the `ILanguageModel` port modules consume, the Anthropic adapter, the decorators the host composes (cost journal, budget, circuit breaker), the `ai_call` journal and the evaluation harness. Auto-loaded under `packages/llm/`. Consumers: `modules/extraction` (port and contract), `apps/api` (composition in `composition/llm.ts`, retention sweep). Spec: `classroom-parents-pilot/briefs/ai-spec.md`.

## Layout

```
src/contract/     what application code may import: port, LlmError, features, untrusted-data policy, withoutLinks, promptFingerprint
src/provider/     the Anthropic adapter, the nonce fence, the tier to model and price table (models.ts, the only place a model id or a price lives)
src/decorators/   Metered (journal, cost), Budgeted (+ SwitchedLlmBudget), CircuitBreaker
src/journal/      IAiCallLog and its Drizzle store
schemas/          ai_call (collected by drizzle-kit like a module schema)
eval/             generic harness (median of runs, thresholds.json, recording journal) and the adversarial leak scan
```

## Rules

1. **A module sees the port, never a provider.** Application code imports `src/contract/*` only; the SDK stays inside `src/provider/` (dependency-cruiser forbids it elsewhere). Each module narrows `LlmError` to its own codes at its boundary, keeping the `LlmError` as `cause`. **Why**: swapping or pinning the provider touches one folder, and a caller never branches on a provider exception.
2. **Instructions in `system`, our facts in `context`, third-party content in `data`.** `system` is a constant and the only block with `cache_control`; `data` is fenced between `<data-NONCE>` tags drawn per request, and tags of that shape are stripped from content; every system prompt includes `UNTRUSTED_DATA_POLICY`. **Why**: a forged closing tag cannot match an unguessable nonce, and a cache breakpoint on anything but a constant could share a family's content.
3. **The host composes `Budgeted(CircuitBreaker(Metered(provider)))`.** Budget refuses before any cost (`LLM_DISABLED` with no key or a feature in `AI_DISABLED_FEATURES`, `LLM_BUDGET_EXHAUSTED` once quotas exist); the breaker counts provider outages only; Metered writes one `ai_call` row per call. **Why**: what a call costs and whether it may run are decided in one place, for every feature.
4. **`ai_call` holds no content.** Every text column is an enum or a checked format (`input_hash` is a SHA-256, the prompt version a slug), proven by `ai-call-schema.test.ts` and `check:ai-call-journal`; rows leave after 90 days and with the account. **Why**: the journal is the cost and failure record, a place where a prompt or an output could land would be a second copy of minors' data.
5. **A prompt names its version and the version is pinned.** `promptFingerprint(system, schema)` is asserted next to `PROMPT_VERSION` in the module's test; editing either bumps the version. **Why**: every cost row, eval result and cache entry must say which prompt produced it.
6. **A change the model can feel passes the eval.** A prompt, an output schema, the input normalisation, the model table or this kit triggers `.github/workflows/ai-eval.yml` (median of 3 runs against `eval/thresholds.json`, adversarial set on its worst run); a case the pipeline still loses carries `knownGap` naming the task that closes it, it is measured but not gated.

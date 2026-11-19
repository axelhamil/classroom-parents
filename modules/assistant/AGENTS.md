# assistant rules

What a family chose about language, region and AI, and what its AI use costs: preferences (`GET /assistant/preferences`, `PUT /assistant/preferences/language-and-region`, `PUT /assistant/preferences/extraction`), monthly quotas, the global spend breaker and the operator alerts. Module contract: `modules/CLAUDE.md`. Spec: `classroom-parents-pilot/briefs/ai-spec.md` §4.3, §5.1, §7.

## Invariants

1. **A preference not chosen is `null`, never a default.** The app fills `null` from the browser (language, time zone, country deduced from the zone); a server consumer that needs a value picks its own fallback. `extraction_enabled` defaults to `true` (the reading is the service, the parent may oppose). **Why**: a default stored on the parent's behalf would look like their choice.
2. **Opposition is enforced around whichever extractor is bound** (`withExtractionConsent` in `apps/api/src/composition/bindings.ts`, applied to the real one and to the `FAKE_PROVIDERS` one): an opposed family's announcement never reaches the extraction and comes back `ANNOUNCEMENT_READING_DISABLED`, which the sync stores as `paused` without spending an attempt; coursework still syncs without AI. Allowing the reading again emits `assistant.extraction.resumed` (`actorUserId`), on which classroom-sync starts a sync that reads the paused announcements that may still hold a date to come (a written date not passed, or none and published less than 14 days ago), through the extraction cache and the quota. **Why**: one gate before the cache, the prompt and the model, and dev behaves like production so the a11y gate and the journeys can exercise it.
3. **Quotas are decided by `QuotaPolicy` from `FEATURE_QUOTAS`** (`application/config/ai-quotas.ts`, typed `Record<LlmFeature, …>`, so a new kit feature does not compile without its quota). The announcement reading is `essential`: never refused at the fast tier, only its escalation stops (feature over 0.08 $, family over 0.25 $, global pause). Every other feature stops on its calls, escalations, cost or the family cap, with `resumesOn` = first day of the next UTC month.
4. **The kit asks this module through the host** (`apps/api/src/composition/llm.ts`): `quotaBudgetFor` is the `ILlmBudget`, `quotaCountingJournal` adds each journaled call to `ai_usage`. A call that cost nothing uses no quota. The global pause is read from the `ai_call` journal at most once a minute per instance.
5. **`ai_usage` and `ai_usage_alert` are cost bookkeeping, not business state**: no event per call. The one fact announced is the quota closing (`assistant.quota.exhausted`, once, in the unit of work of the write that closed it). A preference change emits `assistant.preference.changed` with the whole new state, nothing when unchanged.
6. **Operator alerts go out once per period** (`ai_usage_alert`, unique with `NULLS NOT DISTINCT`), claimed in the same unit of work as the queued email, so a failed send releases the claim. No content, only ids and amounts.

Rows cascade with the user, are part of the data export, and `ai_usage`/`ai_usage_alert` leave after 400 days (`sweep-ai-usage`). Proven on a real database by `check:assistant-db`.

## Composition

The api composes this module in a container of its own (`apps/api/src/composition/assistant.ts`), the kit and the extractor reach it lazily (`() => assistant.X`), so the main container gains no key.

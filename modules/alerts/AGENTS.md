# alerts rules

Reminders before each deadline, quiet hours, the lost access warning and the Sunday digest, by push or email. Module contract: `modules/CLAUDE.md`.

## The parent's zone

1. **A stored alert is an instant, never a zone**: `due_at` is the fact, `AlertTime` holds only it, and every wall time (reminder "the day before at 18:00", quiet hours, the digest's Sunday 18:00) is computed from the zone `IParentTimeZone` gives at that moment. No column of this module copies the preference. **Why**: the assistant's preference is the single source; a copy goes stale the day the parent moves.
2. **A change of zone replans**: `alerts-follow-time-zone` handles `assistant.preference.changed` and replans the parent's upcoming alerts in the new zone; it is idempotent, an unchanged zone reschedules nothing. **Why**: an instant planned for Paris rings at 12:00 for a parent now in Montreal. Proven by `check:alert-db`.
3. **The Sunday digest is planned once the first zone of the world reaches Sunday 18:00, due at each parent's own Sunday 18:00** (`next_attempt_at`), and the claim compares it with the run's clock. **Why**: one pass plans every zone; a claim on the database clock would ignore the clock the service runs on. A zone change after planning does not move that week's digest.

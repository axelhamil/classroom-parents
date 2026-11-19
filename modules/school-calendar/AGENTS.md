# school-calendar rules

School holidays and bank holidays of the zone a parent chose (`GET /school-calendar?from&to`, `GET|PUT /school-calendar/zone`). Module contract: `modules/CLAUDE.md`.

## Invariants

1. **The official calendars are read by the server only**, through `ISchoolCalendarSource` (data.education.gouv.fr dataset `fr-en-calendrier-scolaire`, calendrier.api.gouv.fr, Licence Ouverte 2.0). **Why**: the app's CSP `connect-src` lists the api alone, and one cached read serves every parent.
2. **Every read goes through the cache table** (`school_calendar_cache`, one row per zone and school year, one per territory and calendar year): fresh for 7 days, then refetched; when the source fails, the last copy is served however old, and only a miss without any copy is `SCHOOL_CALENDAR_UNAVAILABLE`. Writing the cache is bookkeeping, not a state change: no event.
3. **A period runs from its first to its last day off, in Paris dates.** The dataset gives `end_date` as the day classes resume, except for a one-day bridge where start equals end; teacher-only rows are dropped. Change the mapping only with `open-data-school-calendar.source.test.ts`.
4. **No zone, no calendar**: a parent who never chose gets `zone: null` and empty lists, never a default zone. The academy list only proposes a zone; it is not stored.
5. **The zone choice emits `school_calendar.zone.changed`** (`userId`, `zone` or `null` when cleared) in the unit of work of its write, nothing when the value is already in force. The row cascades with the user (RGPD wipe) and is part of the data export.

## Composition

The api composes this module in a container of its own (`apps/api/src/composition/school-calendar.ts`); `FAKE_PROVIDERS=1` overrides the source with `src/testing/fake-school-calendar.source.ts`, a copy of the real 2025-2026 and 2026-2027 mainland data.

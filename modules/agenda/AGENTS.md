# agenda rules

A parent's deadlines: extracted from announcements, followed from Classroom coursework, or added by hand. Module contract: `modules/CLAUDE.md`.

## Invariants

1. **The software never moves nor deletes a deadline on its own judgement.** A later announcement that moves or cancels an earlier deadline sends that deadline back to review (`agenda.event.flagged`, with the reason); the corrected date arrives as a new event. **Why**: an automatic move or removal that guesses wrong hides a real deadline, the one failure the product cannot afford.
2. **An announcement deadline naming the same work as a live coursework of its child, course and day is hidden behind it, reversibly**: `withdrawn_at` on an announcement means exactly that and nothing else (`agenda.event.superseded`; it comes back with `agenda.event.updated` `["withdrawn"]`). Any write that changes a coursework's day or title, or retires it, re-runs `AnnouncementReconciler` on the days it left and joined. **Why**: the coursework is the structured source, and a hiding nobody re-checks would keep a deadline hidden after its coursework is gone.
3. **A deadline the parent edited or deleted is never touched by a sync**: never hidden, never flagged, never brought back. One the parent confirmed (`confirmed_by_parent_at`) is never sent back to review by a later amendment. **Why**: the parent's word beats any inference.
4. **Title matching is prudent** (`domain/services/same-work.ts`): accents, case, punctuation and grammatical words are ignored, and a weak overlap means "different work". An amendment flags only a single unambiguous target. **Why**: a missed duplicate costs one extra card; a wrong match hides a deadline.
5. **A reread fills only the evidence and the preparation** (`EventRereadService`, `agenda.event.updated` with `actorUserId` null) of the live deadline at the same ordinal and the same day of its announcement; a reading that matches none changes nothing. **Why**: an operator reread must bring the new fields without ever moving, adding or bringing back a deadline (invariants 1 and 3).

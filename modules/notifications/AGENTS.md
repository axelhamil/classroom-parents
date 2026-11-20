# notifications rules

The parent's in-app notification center: what the alerts sent and what the sync found, listed newest first (`GET /notifications`, cursor), counted unread (`GET /notifications/unread-count`), read one by one, by push reference or all at once. Module contract: `modules/CLAUDE.md`.

## Invariants

1. **Written only by `onEvent` handlers** on events other modules already emit (`alert.alert.sent`, `alert.weekly_digest.sent`, `alert.access_loss.sent`, `classroom.announcements.synced`, `agenda.event.flagged`, `agenda.event.created` when `needsReview`, `child.account.connected` when the scheduled sync finds the school allowed the app: `restoredFrom` is `school_blocked` and no actor), never called by another module. A parent's own action (a tick, an edit, a manual add, a reconnection) never notifies. **Why**: the center is a read of what happened to the family, not a second channel each module has to remember.
2. **A row stores a kind and typed parameters, never a sentence.** The app writes the text in the parent's language from `content`; titles come from the agenda at read time (`IEventSummaries`, a host query, owner in the `WHERE`), so a renamed or deleted event never shows stale copy. The lock screen discretion applies to the push only: the signed-in app shows names and titles.
3. **One row per `(user_id, ref)`**: a redelivered event writes nothing and announces nothing. `ref` is what the push carries (`@packages/events/notification-ref`), so opening a push reads its notification (`POST /notifications/read-by-ref`). Dates to check gather per child and UTC day in `members`; a new member turns the row unread again, a replayed one changes nothing.
4. **Every write emits** `notification.notification.created` (with `grouped`), `.read` or `notification.notifications.read_all`; the user stream relays them as `notification.created` and `notifications.read`, which refresh the bell without polling.
5. A notification about a child removed meanwhile is dropped (foreign key violation read as nothing to write), not retried.

Rows cascade with the account and the child, are part of the data export, and leave after 90 days (`sweep-notifications`). Proven on a real database by `pnpm --filter api check:notifications-db`.

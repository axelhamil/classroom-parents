# classroom-sync rules

Reads each linked child's Classroom (courses, announcements, coursework) and hands deadlines to the agenda. Module contract: `modules/CLAUDE.md`.

## A child blocked by its school

**The scheduled sync retries it by itself, the parent never has to.** A child `blocked_by_school` is claimed like a connected one once its `next_sync_at` is due, which the children module spaces out an hour after the block, then six hours, then once a day (`SCHOOL_RETRY_DELAYS_MS`, counted by `sync_attempts`): one course listing per try, so a school that never answers costs one Google call a day. A read that succeeds ends the sync like any other, and `markSynced` turns the child connected and emits `child.account.connected` with `restoredFrom: "school_blocked"` and `actorUserId: null` in that same unit of work; the notification center and the live stream take it from there. Proven by `check:child-db` and `check:end-to-end`.

## Rereading a parent's announcements (`reread:announcements`)

`pnpm --filter api reread:announcements (--user <id> | --email <address>) [--child <id>] [--with-model] [--apply]` rereads, with the current extraction, the announcements of the sync window that already gave deadlines (ledger `extracted`), and fills the evidence and the preparation of those deadlines.

1. **Dry run by default, and it spends nothing**: it reads through the extraction cache only (`cacheOnly`), counts a miss as a skipped model call and writes nothing. `--with-model` reads misses with the model (quota spent, cache filled, nothing written); `--apply` reads them and writes. **Why**: a cache keyed on the prompt version misses every result read before the current version, so a careless run would bill each family's whole window.
2. **It goes through the bound `IAnnouncementExtractor`**, so the AI opposition and the family quotas apply exactly as in a sync; it never touches the ledger nor the sync lease.
3. **It only enriches, through `IEventIngest.applyReread`** (agenda invariant 5): a deadline is never created, moved nor deleted by a reread. Coursework is not reread: the model never reads it.

## The parent's day

1. **Every day and hour of a sync is the parent's**, read once per sync through `IParentTimeZone`: the 07:00 opening of the cadence, the wall date of a Classroom UTC due date, and the day a paused announcement is compared with. **Why**: a Montreal parent's 26 November ends five hours after Paris's, so a Paris clock rereads too little and opens the day in the middle of the night.
2. **The dates an announcement writes out come from extraction's `writtenDates`, through `IWrittenDates`**, never from a local list of month names. **Why**: extraction owns the five school languages; a second list here would forget the next language and keep paused announcements asleep. A numeric date gives both its readings, so a US "11/26" still wakes the announcement.

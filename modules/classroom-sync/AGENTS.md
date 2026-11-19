# classroom-sync rules

Reads each linked child's Classroom (courses, announcements, coursework) and hands deadlines to the agenda. Module contract: `modules/CLAUDE.md`.

## Rereading a parent's announcements (`reread:announcements`)

`pnpm --filter api reread:announcements (--user <id> | --email <address>) [--child <id>] [--with-model] [--apply]` rereads, with the current extraction, the announcements of the sync window that already gave deadlines (ledger `extracted`), and fills the evidence and the preparation of those deadlines.

1. **Dry run by default, and it spends nothing**: it reads through the extraction cache only (`cacheOnly`), counts a miss as a skipped model call and writes nothing. `--with-model` reads misses with the model (quota spent, cache filled, nothing written); `--apply` reads them and writes. **Why**: a cache keyed on the prompt version misses every result read before the current version, so a careless run would bill each family's whole window.
2. **It goes through the bound `IAnnouncementExtractor`**, so the AI opposition and the family quotas apply exactly as in a sync; it never touches the ledger nor the sync lease.
3. **It only enriches, through `IEventIngest.applyReread`** (agenda invariant 5): a deadline is never created, moved nor deleted by a reread. Coursework is not reread: the model never reads it.

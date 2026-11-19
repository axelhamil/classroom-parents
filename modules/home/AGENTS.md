# home rules

The parent's home screen preferences: the block layout (`GET|PUT /home/layout`) and the free note pinned on it (`GET|PUT /home/note`). Module contract: `modules/CLAUDE.md`.

## Invariants

1. **The server validates the shape of a layout, never its block ids.** The block registry and the default layout belong to the app; the server only enforces the id pattern, unique ids, 40 blocks at most and the size steps. **Why**: a block added or removed in the app ships without an api change, and the app normalizes a stored layout against its registry on read.
2. **No row means the default**: `blocks: null` is a parent who never arranged their home or reset it, an empty note is no row. Writing `null` or an empty note deletes the row.
3. **Each change emits its event in the unit of work of its write** (`home.layout.changed` with `reset`, `home.note.changed` with `cleared`), nothing when the value is already in force. The note's content never enters a payload: the outbox and the event history outlive the row.
4. Both rows cascade with the user (RGPD wipe) and are part of the data export. The note is free text stored in clear: only the OAuth tokens are sealed at rest.

## Composition

The api composes this module in a container of its own (`apps/api/src/composition/home.ts`), for the same TS2589 ceiling as the school calendar.

# home rules

The parent's home screen preferences: the block layout (`GET|PUT /home/layout`) and the free note pinned on it (`GET|PUT /home/note`). Module contract: `modules/CLAUDE.md`.

## Invariants

1. **The server validates the shape of a layout, never its block ids.** A layout is `{ v: 2, blocks: [{ id, size }] }`: the array is the reading order and a block missing from it is hidden. The block registry, the sizes each block allows and the advised layout belong to the app; the server only enforces the id pattern, unique ids, 40 blocks at most and the size enum. **Why**: a block added or removed in the app ships without an api change. A row still in the first format (`[{ id, w, h, hidden }]`) is read as v2 by the repository mapper and rewritten in v2 on the next save, never migrated in SQL.
2. **`blocks: null` means the advised layout, and the revision only moves forward.** A parent who never arranged their home has no row (revision 0); a reset writes `null` and keeps the row, so its revision keeps counting. Every save carries the `baseRevision` it started from and the write is conditioned on it: a base already passed is `HOME_LAYOUT_STALE` (409). **Why**: two tabs or two devices must not silently overwrite each other, and a deleted row would bring the revision back to 0 and let a stale base through. An empty note is no row.
3. **Each change emits its event in the unit of work of its write** (`home.layout.changed` with `reset` and the new `revision`, which the user stream relays as `home.changed`; `home.note.changed` with `cleared`), nothing when the value is already in force: such a save writes nothing and answers the current revision. The note's content never enters a payload: the outbox and the event history outlive the row.
4. Both rows cascade with the user (RGPD wipe) and are part of the data export. The note is free text stored in clear: only the OAuth tokens are sealed at rest.

## Composition

The api composes this module in a container of its own (`apps/api/src/composition/home.ts`), for the same TS2589 ceiling as the school calendar.

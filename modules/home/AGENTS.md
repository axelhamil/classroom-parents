# home rules

The parent's home screen preferences: the block layout (`GET|PUT /home/layout`) and the free note pinned on it (`GET|PUT /home/note`). Module contract: `modules/CLAUDE.md`.

## Invariants

1. **The server validates the shape of a layout, never its block ids.** A layout is `{ v: 3, blocks: [{ id, w, h }] }` in cases of the home grid: the array is the reading order, a missing block is hidden. Registry, bounds and advice belong to the app; the server enforces the id pattern, unique ids, 40 blocks at most and whole sizes within 4 columns and 8 rows. **Why**: a block added or resized in the app ships without an api change. The server answers v3 only and is the one place older forms are read: the first format (`[{ id, w, h, hidden }]`), fixed sizes (`{ v: 2, blocks: [{ id, size }] }`) and a save still in fixed sizes go through one domain table (S 1x1, M 2x1, L 2x2, XL 4x2); a row is rewritten in v3 on its next change, never migrated in SQL. The app reads v3 only and drops a local copy in another form. For one release each block of a reply also carries `size`, its nearest fixed size by that table. **Why**: a tab loaded before the deploy reads `size` only; without it every block snaps to its smallest size and its next edit overwrites the layout. Remove `size` from the reply at the next release. A stored duplicate id or out-of-bounds size is corruption no writer can produce: it answers 500 and is captured, on purpose.
2. **`blocks: null` means the advised layout, and the revision only moves forward.** A parent who never arranged their home has no row (revision 0); a reset writes `null` and keeps the row, so its revision keeps counting. Every save carries the `baseRevision` it started from and the write is conditioned on it: a base already passed is `HOME_LAYOUT_STALE` (409). **Why**: two tabs or two devices must not silently overwrite each other, and a deleted row would bring the revision back to 0 and let a stale base through. An empty note is no row.
3. **Each change emits its event in the unit of work of its write** (`home.layout.changed` with `reset` and the new `revision`, which the user stream relays as `home.changed`; `home.note.changed` with `cleared`), nothing when the value is already in force: such a save writes nothing and answers the current revision. The note's content never enters a payload: the outbox and the event history outlive the row.
4. Both rows cascade with the user (RGPD wipe) and are part of the data export. The note is free text stored in clear: only the OAuth tokens are sealed at rest.

## Composition

The api composes this module in a container of its own (`apps/api/src/composition/home.ts`), for the same TS2589 ceiling as the school calendar.

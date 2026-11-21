/**
 * Proves against a real Postgres what mocked ports cannot: a layout stored in the first format or
 * in fixed sizes reads back in cases, a save from a client still on fixed sizes is stored in
 * cases, a client loaded before the sizes in cases reads its fixed sizes back and saving them
 * changes nothing, a layout survives the jsonb round trip (which reorders the keys
 * of each block) so writing it again is recognized as identical and announces nothing, two saves
 * racing from the same revision let exactly one through, first write and later ones alike, a
 * reset keeps the row and its revision moving forward, each change and its event commit or roll
 * back together, an emptied note deletes its row, and an account deletion removes both rows by
 * foreign key cascade. Removes its probe parent and its outbox rows.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-home-db", process.env.DATABASE_URL);

import { Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  count,
  db,
  eq,
  outboxSchema,
  TransactionService,
} from "@packages/drizzle";
import { type EventType, EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { z } from "zod";
import { homeLayout, homeNote } from "../schemas/home.schema";
import type { HomeBlockDto } from "../src/application/dto/home.dto";
import { HomeService } from "../src/application/services/home.service";
import type { HomeBlock } from "../src/domain/value-objects/home-layout.vo";
import { DrizzleHomeRepository } from "../src/infrastructure/repositories/drizzle-home.repository";

const PARENT = `check-home-${crypto.randomUUID()}`;
const FIRST_FORMAT = [
  { id: "calendar", w: 12, h: 3, hidden: false },
  { id: "overdue", w: 4, h: 1, hidden: true },
  { id: "today", w: 6, h: 2, hidden: false },
  { id: "tonight", w: 8, h: 2, hidden: false },
  { id: "review", w: 4, h: 1, hidden: false },
  { id: "progress", w: 3, h: 1, hidden: false },
];
const READ_AS_CURRENT: HomeBlockDto[] = [
  { id: "calendar", w: 4, h: 2, size: "xl" },
  { id: "today", w: 2, h: 2, size: "l" },
  { id: "tonight", w: 2, h: 2, size: "l" },
  { id: "review", w: 2, h: 1, size: "m" },
  { id: "progress", w: 1, h: 1, size: "s" },
];
const FIXED_SIZES = {
  v: 2,
  blocks: [
    { id: "progress", size: "s" },
    { id: "review", size: "m" },
    { id: "today", size: "l" },
    { id: "calendar", size: "xl" },
  ],
} as const;
const FIXED_SIZES_IN_CASES: HomeBlockDto[] = [
  { id: "progress", w: 1, h: 1, size: "s" },
  { id: "review", w: 2, h: 1, size: "m" },
  { id: "today", w: 2, h: 2, size: "l" },
  { id: "calendar", w: 4, h: 2, size: "xl" },
];
const OLD_CLIENT_REPLY = z.object({
  blocks: z.array(z.object({ id: z.string(), size: z.enum(["s", "m", "l", "xl"]) })).nullable(),
  revision: z.number(),
});
const BLOCKS: HomeBlock[] = [
  { id: "agenda", w: 4, h: 2 },
  { id: "child:0193a1b2-c3d4", w: 2, h: 1 },
];
const BLOCKS_REPLY: HomeBlockDto[] = [
  { id: "agenda", w: 4, h: 2, size: "xl" },
  { id: "child:0193a1b2-c3d4", w: 2, h: 1, size: "m" },
];
const OTHER_BLOCKS: HomeBlock[] = [{ id: "notes", w: 2, h: 2 }];
const SMALL_NOTES: HomeBlock[] = [{ id: "notes", w: 1, h: 1 }];
const MEDIUM_NOTES: HomeBlock[] = [{ id: "notes", w: 2, h: 1 }];

const { instrumentation } = spanRecorder();

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-home-db" });
});
const service = new HomeService(
  new DrizzleHomeRepository(instrumentation),
  transactions,
  outbox,
  instrumentation,
);

async function rowsOf(): Promise<{ layouts: number; notes: number }> {
  const [layouts] = await db
    .select({ total: count() })
    .from(homeLayout)
    .where(eq(homeLayout.userId, PARENT));
  const [notes] = await db
    .select({ total: count() })
    .from(homeNote)
    .where(eq(homeNote.userId, PARENT));

  return { layouts: layouts?.total ?? 0, notes: notes?.total ?? 0 };
}

async function storedLayoutOf(): Promise<{ blocks: unknown; revision: number } | undefined> {
  const [row] = await db
    .select({ blocks: homeLayout.blocks, revision: homeLayout.revision })
    .from(homeLayout)
    .where(eq(homeLayout.userId, PARENT));

  return row;
}

async function racingSaves(
  baseRevision: number,
  left: HomeBlock[],
  right: HomeBlock[],
): Promise<string[]> {
  const saves = await Promise.all([
    service.setLayout(PARENT, { v: 3, blocks: left, baseRevision }),
    service.setLayout(PARENT, { v: 3, blocks: right, baseRevision }),
  ]);

  return saves.map((save) => (save.isSuccess ? "saved" : save.getError().code)).sort();
}

const ONE_SAVED_ONE_STALE = JSON.stringify(["HOME_LAYOUT_STALE", "saved"]);

async function eventsOf(type: EventType): Promise<number> {
  const { outboxEvent } = outboxSchema;
  const [row] = await db
    .select({ total: count() })
    .from(outboxEvent)
    .where(and(eq(outboxEvent.aggregateId, PARENT), eq(outboxEvent.eventType, type)));

  return row?.total ?? 0;
}

async function forgetEvents(): Promise<void> {
  const { outboxEvent } = outboxSchema;
  await db.delete(outboxEvent).where(eq(outboxEvent.aggregateId, PARENT));
}

async function cleanup(): Promise<void> {
  await forgetEvents();
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
}

const { step, run } = stepRunner("check-home-db", cleanup);

run(async () => {
  await cleanup();
  await db
    .insert(authSchema.user)
    .values({ id: PARENT, name: "Home", email: `${PARENT}@example.com` });

  await db
    .insert(homeLayout)
    .values({ userId: PARENT, blocks: FIRST_FORMAT, updatedAt: new Date() });
  const legacy = await service.layout(PARENT);
  await step(
    "a layout stored in the first format reads in the current one: hidden blocks out, widths as cases",
    legacy.isSuccess &&
      JSON.stringify(legacy.getValue()) ===
        JSON.stringify({ v: 3, blocks: READ_AS_CURRENT, revision: 0 }),
    legacy.isSuccess ? legacy.getValue() : legacy.getError(),
  );

  await db.update(homeLayout).set({ blocks: FIXED_SIZES }).where(eq(homeLayout.userId, PARENT));
  const fixed = await service.layout(PARENT);
  await step(
    "a layout stored in fixed sizes reads in cases: S 1x1, M 2x1, L 2x2, XL 4x2, order kept",
    fixed.isSuccess &&
      JSON.stringify(fixed.getValue()) ===
        JSON.stringify({ v: 3, blocks: FIXED_SIZES_IN_CASES, revision: 0 }),
    fixed.isSuccess ? fixed.getValue() : fixed.getError(),
  );

  const fromOldClient = await service.setLayout(PARENT, {
    blocks: [
      { id: "calendar", size: "xl" },
      { id: "today", size: "l" },
    ],
    baseRevision: 0,
  });
  const storedFromOldClient = await storedLayoutOf();
  await step(
    "a save in fixed sizes from a client loaded before the change is stored in cases under the next revision",
    fromOldClient.isSuccess &&
      JSON.stringify(storedFromOldClient) ===
        JSON.stringify({
          blocks: {
            v: 3,
            blocks: [
              { h: 2, w: 4, id: "calendar" },
              { h: 2, w: 2, id: "today" },
            ],
          },
          revision: 1,
        }) &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 1,
    {
      fromOldClient: fromOldClient.isSuccess ? fromOldClient.getValue() : fromOldClient.getError(),
      storedFromOldClient,
    },
  );

  const staleOldClient = await service.setLayout(PARENT, {
    blocks: [{ id: "notes", size: "s" }],
    baseRevision: 0,
  });
  await step(
    "a save in fixed sizes from a revision already passed is refused as stale",
    staleOldClient.isFailure && staleOldClient.getError().code === "HOME_LAYOUT_STALE",
  );

  const beforeOldRoundTrip = await storedLayoutOf();
  const oldRead = OLD_CLIENT_REPLY.safeParse((await service.layout(PARENT)).getValue());
  const oldSave = oldRead.success
    ? await service.setLayout(PARENT, {
        blocks: oldRead.data.blocks,
        baseRevision: oldRead.data.revision,
      })
    : undefined;
  await step(
    "a client loaded before the sizes in cases reads its fixed sizes, and saving them back changes nothing",
    oldRead.success &&
      JSON.stringify(oldRead.data.blocks) ===
        JSON.stringify([
          { id: "calendar", size: "xl" },
          { id: "today", size: "l" },
        ]) &&
      oldSave?.isSuccess === true &&
      JSON.stringify(await storedLayoutOf()) === JSON.stringify(beforeOldRoundTrip) &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 1,
    { oldRead: oldRead.success ? oldRead.data : oldRead.error, beforeOldRoundTrip },
  );

  await db.delete(homeLayout).where(eq(homeLayout.userId, PARENT));
  await forgetEvents();
  const firstRace = await racingSaves(0, BLOCKS, OTHER_BLOCKS);
  await step(
    "two first saves racing from revision 0 let exactly one through",
    JSON.stringify(firstRace) === ONE_SAVED_ONE_STALE &&
      (await storedLayoutOf())?.revision === 1 &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 1,
    firstRace,
  );

  const laterRace = await racingSaves(1, SMALL_NOTES, MEDIUM_NOTES);
  const afterRace = await storedLayoutOf();
  await step(
    "two later saves racing from the same revision let exactly one through, stored in the current format",
    JSON.stringify(laterRace) === ONE_SAVED_ONE_STALE &&
      afterRace?.revision === 2 &&
      typeof afterRace.blocks === "object" &&
      afterRace.blocks !== null &&
      "v" in afterRace.blocks &&
      afterRace.blocks.v === 3 &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 2,
    { laterRace, afterRace },
  );

  const stale = await service.setLayout(PARENT, { v: 3, blocks: OTHER_BLOCKS, baseRevision: 1 });
  await step(
    "a save from a revision already passed is refused as stale and announces nothing",
    stale.isFailure &&
      stale.getError().code === "HOME_LAYOUT_STALE" &&
      (await storedLayoutOf())?.revision === 2 &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 2,
  );

  await service.setLayout(PARENT, { v: 3, blocks: BLOCKS, baseRevision: 2 });
  const arranged = await service.setLayout(PARENT, { v: 3, blocks: BLOCKS, baseRevision: 3 });
  await step(
    "the stored layout reads back block for block, in order, and the same layout again announces nothing",
    arranged.isSuccess &&
      JSON.stringify(arranged.getValue()) ===
        JSON.stringify({ v: 3, blocks: BLOCKS_REPLY, revision: 3 }) &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 3,
    arranged.isSuccess ? arranged.getValue() : arranged.getError(),
  );

  let savedBeforeRollback = false;
  await transactions.run(async () => {
    const inside = await service.setLayout(PARENT, { v: 3, blocks: OTHER_BLOCKS, baseRevision: 3 });
    savedBeforeRollback = inside.isSuccess && inside.getValue().revision === 4;
    return Result.fail("check-home-db rolls back on purpose");
  });
  await step(
    "a change rolled back takes its event with it",
    savedBeforeRollback &&
      (await storedLayoutOf())?.revision === 3 &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 3,
  );

  const reset = await service.setLayout(PARENT, { v: 3, blocks: null, baseRevision: 3 });
  const afterReset = await storedLayoutOf();
  await step(
    "a reset keeps the row under a new revision and announces it",
    reset.isSuccess &&
      JSON.stringify(reset.getValue()) === JSON.stringify({ v: 3, blocks: null, revision: 4 }) &&
      afterReset?.blocks === null &&
      afterReset.revision === 4 &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 4,
    afterReset,
  );

  const written = await service.setNote(PARENT, "  Piscine le jeudi  ");
  await service.setNote(PARENT, "Piscine le jeudi");
  await step(
    "a note is stored trimmed and announced once, the same note again announces nothing",
    written.isSuccess &&
      written.getValue().body === "Piscine le jeudi" &&
      (await rowsOf()).notes === 1 &&
      (await eventsOf(EventTypes.HOME_NOTE_CHANGED)) === 1,
  );

  await service.setNote(PARENT, "   ");
  await step(
    "an emptied note removes the row and announces it",
    (await rowsOf()).notes === 0 && (await eventsOf(EventTypes.HOME_NOTE_CHANGED)) === 2,
  );

  await service.setLayout(PARENT, { v: 3, blocks: BLOCKS, baseRevision: 4 });
  await service.setNote(PARENT, "Sortie au musée");
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
  const left = await rowsOf();
  await step(
    "an account deletion removes the layout and the note by cascade",
    left.layouts === 0 && left.notes === 0,
    left,
  );
}, "the home layout and note hold on a real database");

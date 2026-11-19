/**
 * Proves against a real Postgres what mocked ports cannot: a layout survives the jsonb round
 * trip (which reorders the keys of each block) so writing it again is recognized as identical
 * and announces nothing, a reset and an emptied note delete their row, each change and its event
 * commit in one transaction, and an account deletion removes both rows by foreign key cascade.
 * Removes its probe parent and its outbox rows.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-home-db", process.env.DATABASE_URL);

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
import { homeLayout, homeNote } from "../schemas/home.schema";
import { HomeService } from "../src/application/services/home.service";
import type { HomeBlock } from "../src/domain/value-objects/home-layout.vo";
import { DrizzleHomeRepository } from "../src/infrastructure/repositories/drizzle-home.repository";

const PARENT = `check-home-${crypto.randomUUID()}`;
const BLOCKS: HomeBlock[] = [
  { id: "agenda", w: 8, h: 2, hidden: false },
  { id: "child:0193a1b2-c3d4", w: 4, h: 1, hidden: true },
];

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

async function eventsOf(type: EventType): Promise<number> {
  const { outboxEvent } = outboxSchema;
  const [row] = await db
    .select({ total: count() })
    .from(outboxEvent)
    .where(and(eq(outboxEvent.aggregateId, PARENT), eq(outboxEvent.eventType, type)));

  return row?.total ?? 0;
}

async function cleanup(): Promise<void> {
  const { outboxEvent } = outboxSchema;
  await db.delete(outboxEvent).where(eq(outboxEvent.aggregateId, PARENT));
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
}

const { step, run } = stepRunner("check-home-db", cleanup);

run(async () => {
  await cleanup();
  await db
    .insert(authSchema.user)
    .values({ id: PARENT, name: "Home", email: `${PARENT}@example.com` });

  const arranged = await service.setLayout(PARENT, BLOCKS);
  await step(
    "arranging the home stores the layout and announces it once",
    arranged.isSuccess &&
      (await rowsOf()).layouts === 1 &&
      (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 1,
  );

  const read = await service.layout(PARENT);
  await step(
    "the stored layout reads back block for block, in order",
    read.isSuccess && JSON.stringify(read.getValue().blocks) === JSON.stringify(BLOCKS),
    read.isSuccess ? read.getValue() : read.getError(),
  );

  await service.setLayout(PARENT, BLOCKS);
  await step(
    "the same layout again announces nothing",
    (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 1,
  );

  await service.setLayout(PARENT, null);
  await step(
    "a reset removes the row and announces it",
    (await rowsOf()).layouts === 0 && (await eventsOf(EventTypes.HOME_LAYOUT_CHANGED)) === 2,
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

  await service.setLayout(PARENT, BLOCKS);
  await service.setNote(PARENT, "Sortie au musée");
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
  const left = await rowsOf();
  await step(
    "an account deletion removes the layout and the note by cascade",
    left.layouts === 0 && left.notes === 0,
    left,
  );
}, "the home layout and note hold on a real database");

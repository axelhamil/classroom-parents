/**
 * Proves against a real Postgres what mocked ports cannot: the school calendar cache round-trips
 * its jsonb rows and serves an old copy when the official source is down, the zone choice is
 * upserted, cleared and announced in the same transaction as its write, and an account deletion
 * removes the choice by foreign key cascade. The official source is the fake of the module, so
 * the check never reaches the network. Removes its probe parent and the cache keys it wrote.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-school-calendar-db", process.env.DATABASE_URL);

import { Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  count,
  db,
  eq,
  inArray,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { schoolCalendarCache, schoolZonePreference } from "../schemas/school-calendar.schema";
import { sourceFailure } from "../src/application/errors/school-calendar-errors";
import type { ISchoolCalendarSource } from "../src/application/ports/school-calendar-source.port";
import { OfficialCalendarService } from "../src/application/services/official-calendar.service";
import { SchoolCalendarService } from "../src/application/services/school-calendar.service";
import { DrizzleSchoolCalendarCache } from "../src/infrastructure/repositories/drizzle-school-calendar.cache";
import { DrizzleSchoolZoneRepository } from "../src/infrastructure/repositories/drizzle-school-zone.repository";
import { fakeSchoolCalendarSource } from "../src/testing/fake-school-calendar.source";

const PARENT = `check-school-calendar-${crypto.randomUUID()}`;
const CHRISTMAS = { from: "2026-12-14", to: "2027-01-10" };
const CACHE_KEYS = [
  "holidays:zone-b:2025-2026",
  "holidays:zone-b:2026-2027",
  "bank-holidays:metropole:2026",
  "bank-holidays:metropole:2027",
];

const { instrumentation } = spanRecorder();

const official = fakeSchoolCalendarSource();
let sourceIsDown = false;
const source: ISchoolCalendarSource = {
  holidays: (zone, year) =>
    sourceIsDown
      ? Promise.resolve(Result.fail(sourceFailure("holidays")))
      : official.holidays(zone, year),
  bankHolidays: (territory, year) =>
    sourceIsDown
      ? Promise.resolve(Result.fail(sourceFailure("bankHolidays")))
      : official.bankHolidays(territory, year),
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-school-calendar-db" });
});
const service = new SchoolCalendarService(
  new DrizzleSchoolZoneRepository(instrumentation),
  new OfficialCalendarService(
    source,
    new DrizzleSchoolCalendarCache(instrumentation),
    instrumentation,
  ),
  transactions,
  outbox,
  instrumentation,
);

async function storedZone(): Promise<string | undefined> {
  const [row] = await db
    .select({ zone: schoolZonePreference.zone })
    .from(schoolZonePreference)
    .where(eq(schoolZonePreference.userId, PARENT));

  return row?.zone;
}

async function zoneEvents(): Promise<number> {
  const { outboxEvent } = outboxSchema;
  const [row] = await db
    .select({ total: count() })
    .from(outboxEvent)
    .where(
      and(
        eq(outboxEvent.aggregateId, PARENT),
        eq(outboxEvent.eventType, EventTypes.SCHOOL_ZONE_CHANGED),
      ),
    );

  return row?.total ?? 0;
}

async function cleanup(): Promise<void> {
  const { outboxEvent } = outboxSchema;
  await db.delete(outboxEvent).where(eq(outboxEvent.aggregateId, PARENT));
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
  await db.delete(schoolCalendarCache).where(inArray(schoolCalendarCache.key, CACHE_KEYS));
}

const { step, run } = stepRunner("check-school-calendar-db", cleanup);

run(async () => {
  await cleanup();
  await db
    .insert(authSchema.user)
    .values({ id: PARENT, name: "Zone", email: `${PARENT}@example.com` });

  const chosen = await service.setZone(PARENT, "zone-b");
  await step(
    "choosing zone B stores it and announces it once",
    chosen.isSuccess && (await storedZone()) === "zone-b" && (await zoneEvents()) === 1,
  );

  await service.setZone(PARENT, "zone-b");
  await step("choosing the same zone again announces nothing", (await zoneEvents()) === 1);

  const fresh = await service.calendar(PARENT, CHRISTMAS);
  const noel = fresh.isSuccess
    ? fresh.getValue().holidays.find(({ name }) => name === "Vacances de Noël")
    : undefined;
  await step(
    "zone B around Christmas 2026 lists the Christmas holidays",
    noel?.startsOn === "2026-12-19" && noel.endsOn === "2027-01-03",
    fresh.isSuccess ? fresh.getValue() : fresh.getError(),
  );

  await db
    .update(schoolCalendarCache)
    .set({ fetchedAt: sql`now() - interval '60 days'` })
    .where(inArray(schoolCalendarCache.key, CACHE_KEYS));
  sourceIsDown = true;
  const stale = await service.calendar(PARENT, CHRISTMAS);
  await step(
    "with the source down, the 60 day old cached copy is served from Postgres",
    stale.isSuccess && JSON.stringify(stale.getValue()) === JSON.stringify(fresh.getValue()),
    stale.isSuccess ? stale.getValue() : stale.getError(),
  );
  sourceIsDown = false;

  await service.setZone(PARENT, null);
  await step(
    "clearing the zone removes the row and announces it",
    (await storedZone()) === undefined && (await zoneEvents()) === 2,
  );

  await service.setZone(PARENT, "zone-c");
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
  await step(
    "an account deletion removes the zone choice by cascade",
    (await storedZone()) === undefined,
  );
}, "the school calendar cache and the zone choice hold on a real database");

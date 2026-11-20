/**
 * Proves against a real Postgres what mocked ports cannot: the calendar cache round-trips its
 * jsonb rows per source and serves an old copy when the source is down, the choice of a French
 * zone, a Swiss canton or a country without published school holidays is upserted and announced
 * in the unit of work of its write, an imported iCalendar file replaces the previous import while
 * hand-typed periods stay, a period of another parent cannot be removed, and an account deletion
 * removes the choice and the periods by cascade. The official sources are the module's fake, so
 * the check never reaches the network. Removes its probe parents and the cache keys it wrote.
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
  like,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import {
  schoolCalendarCache,
  schoolCalendarChoice,
  schoolHolidayPeriod,
} from "../schemas/school-calendar.schema";
import type { SchoolCalendarDto } from "../src/application/dto/school-calendar.dto";
import { sourceFailure } from "../src/application/errors/school-calendar-errors";
import type { ISchoolCalendarSource } from "../src/application/ports/school-calendar-source.port";
import { CalendarChoiceService } from "../src/application/services/calendar-choice.service";
import { HolidayReader } from "../src/application/services/holiday-reader.service";
import { OfficialCalendarService } from "../src/application/services/official-calendar.service";
import { SchoolCalendarService } from "../src/application/services/school-calendar.service";
import { DrizzleOwnPeriodRepository } from "../src/infrastructure/repositories/drizzle-own-period.repository";
import { DrizzleSchoolCalendarCache } from "../src/infrastructure/repositories/drizzle-school-calendar.cache";
import { DrizzleSchoolCalendarChoiceRepository } from "../src/infrastructure/repositories/drizzle-school-calendar-choice.repository";
import { fakeSchoolCalendarSource } from "../src/testing/fake-school-calendar.source";

const RUN = crypto.randomUUID();
const PARENT = `check-school-calendar-${RUN}`;
const NEIGHBOUR = `check-school-calendar-neighbour-${RUN}`;
const CHRISTMAS = { from: "2026-12-14", to: "2027-01-10" };
const CACHE_PREFIXES = [
  "education-nationale:zone-b:%",
  "api-gouv:metropole:%",
  "openholidays:CH:%",
  "nager-date:%",
];

const SCHOOL_ICS = (summary: string) =>
  [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261221",
    "DTEND;VALUE=DATE:20270102",
    `SUMMARY:${summary}`,
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20261210T170000Z",
    "SUMMARY:Winter concert",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

const { instrumentation } = spanRecorder();

const official = fakeSchoolCalendarSource();
let sourceIsDown = false;
const source: ISchoolCalendarSource = {
  entries: (feed, period) =>
    sourceIsDown
      ? Promise.resolve(Result.fail(sourceFailure("entries")))
      : official.entries(feed, period),
  regions: official.regions,
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-school-calendar-db" });
});
const choices = new DrizzleSchoolCalendarChoiceRepository(instrumentation);
const periods = new DrizzleOwnPeriodRepository(instrumentation);
const officialCalendars = new OfficialCalendarService(
  source,
  new DrizzleSchoolCalendarCache(instrumentation),
  instrumentation,
);
const calendars = new SchoolCalendarService(
  choices,
  periods,
  officialCalendars,
  new HolidayReader(officialCalendars, periods, instrumentation),
  { of: async () => ({ country: null, language: "fr" }) },
  instrumentation,
);
const writes = new CalendarChoiceService(
  choices,
  periods,
  { download: async () => Result.fail(sourceFailure("download")) },
  transactions,
  outbox,
  instrumentation,
);

async function storedChoice(userId = PARENT) {
  const [row] = await db
    .select({ country: schoolCalendarChoice.country, region: schoolCalendarChoice.region })
    .from(schoolCalendarChoice)
    .where(eq(schoolCalendarChoice.userId, userId));

  return row;
}

async function storedPeriods(userId = PARENT) {
  return db
    .select({
      id: schoolHolidayPeriod.id,
      name: schoolHolidayPeriod.name,
      origin: schoolHolidayPeriod.origin,
    })
    .from(schoolHolidayPeriod)
    .where(eq(schoolHolidayPeriod.userId, userId))
    .orderBy(schoolHolidayPeriod.startsOn);
}

async function eventsOf(eventType: string): Promise<number> {
  const { outboxEvent } = outboxSchema;
  const [row] = await db
    .select({ total: count() })
    .from(outboxEvent)
    .where(and(eq(outboxEvent.aggregateId, PARENT), eq(outboxEvent.eventType, eventType)));

  return row?.total ?? 0;
}

async function calendarOf(userId = PARENT): Promise<SchoolCalendarDto | string> {
  const calendar = await calendars.calendar(userId, CHRISTMAS);

  return calendar.isSuccess ? calendar.getValue() : calendar.getError().code;
}

async function cleanup(): Promise<void> {
  const { outboxEvent } = outboxSchema;
  await db.delete(outboxEvent).where(inArray(outboxEvent.aggregateId, [PARENT, NEIGHBOUR]));
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, [PARENT, NEIGHBOUR]));
  for (const prefix of CACHE_PREFIXES)
    await db.delete(schoolCalendarCache).where(like(schoolCalendarCache.key, prefix));
}

const { step, run } = stepRunner("check-school-calendar-db", cleanup);

run(async () => {
  await cleanup();
  await db.insert(authSchema.user).values([
    { id: PARENT, name: "Calendar", email: `${PARENT}@example.com` },
    { id: NEIGHBOUR, name: "Neighbour", email: `${NEIGHBOUR}@example.com` },
  ]);

  const zoneB = { country: "FR", region: "zone-b", schoolHolidays: "official" } as const;
  await writes.choose(PARENT, zoneB);
  await writes.choose(PARENT, zoneB);
  await step(
    "choosing French zone B stores it and announces it once",
    (await storedChoice())?.region === "zone-b" &&
      (await eventsOf(EventTypes.SCHOOL_CALENDAR_CHOICE_CHANGED)) === 1,
  );

  const fresh = await calendarOf();
  const noel =
    typeof fresh === "string"
      ? undefined
      : fresh.holidays.find(({ name }) => name === "Vacances de Noël");
  await step(
    "zone B around Christmas 2026 lists the Christmas holidays",
    noel?.startsOn === "2026-12-19" && noel.endsOn === "2027-01-03",
    fresh,
  );

  await db
    .update(schoolCalendarCache)
    .set({ fetchedAt: sql`now() - interval '60 days'` })
    .where(like(schoolCalendarCache.key, "education-nationale:zone-b:%"));
  sourceIsDown = true;
  const stale = await calendarOf();
  sourceIsDown = false;
  await step(
    "with the source down, the 60 day old cached copy is served from Postgres",
    JSON.stringify(stale) === JSON.stringify(fresh),
    stale,
  );

  await writes.choose(PARENT, { country: "CH", region: "CH-GE", schoolHolidays: "official" });
  const geneva = await calendarOf();
  await step(
    "a family in Geneva gets the Geneva holidays and the Geneva bank holidays",
    typeof geneva !== "string" &&
      geneva.holidays[0]?.name === "Vacances de Noël et Nouvel An" &&
      geneva.bankHolidays.some(({ name }) => name === "Restoration Day"),
    geneva,
  );

  await writes.choose(PARENT, { country: "MA", region: null, schoolHolidays: "own" });
  await writes.addPeriod(PARENT, {
    name: "Aïd al-Fitr",
    startsOn: "2027-03-09",
    endsOn: "2027-03-11",
  });
  await writes.importIcs(PARENT, { content: SCHOOL_ICS("Winter break") });
  await writes.importIcs(PARENT, { content: SCHOOL_ICS("Vacances d'hiver") });
  const imported = await storedPeriods();
  await step(
    "a second import replaces the first one and keeps the hand-typed period, timed events skipped",
    JSON.stringify(imported.map(({ name, origin }) => [name, origin])) ===
      JSON.stringify([
        ["Vacances d'hiver", "ics"],
        ["Aïd al-Fitr", "manual"],
      ]) && (await eventsOf(EventTypes.SCHOOL_HOLIDAYS_EDITED)) === 3,
    imported,
  );

  const morocco = await calendarOf();
  await step(
    "in Morocco the imported holidays and the Moroccan bank holidays are the calendar",
    typeof morocco !== "string" &&
      morocco.holidays.map(({ name }) => name).join() === "Vacances d'hiver" &&
      morocco.bankHolidays.some(({ name }) => name === "New Year's Day") &&
      morocco.schoolHolidaysCovered,
    morocco,
  );

  const manual = imported.find(({ origin }) => origin === "manual");
  const stolen = await writes.removePeriod(NEIGHBOUR, manual?.id ?? "");
  await step(
    "a parent cannot remove a period of another parent",
    stolen.isFailure &&
      stolen.getError().code === "SCHOOL_CALENDAR_PERIOD_NOT_FOUND" &&
      (await storedPeriods()).length === 2,
  );

  await writes.choose(PARENT, null);
  await step(
    "clearing the choice removes the row and announces it",
    (await storedChoice()) === undefined &&
      (await eventsOf(EventTypes.SCHOOL_CALENDAR_CHOICE_CHANGED)) === 4,
  );

  await writes.choose(PARENT, zoneB);
  await db.delete(authSchema.user).where(eq(authSchema.user.id, PARENT));
  await step(
    "an account deletion removes the choice and the periods by cascade",
    (await storedChoice()) === undefined && (await storedPeriods()).length === 0,
  );
}, "the school calendars, the imported and typed holidays and their cascade hold on a real database");

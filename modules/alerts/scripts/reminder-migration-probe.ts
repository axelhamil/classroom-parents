import { readFileSync } from "node:fs";
import { db } from "@packages/drizzle";
import { Reminder } from "../src/domain/value-objects/reminder.vo";
import { ReminderList } from "../src/domain/value-objects/reminder-list.vo";

const MIGRATIONS = new URL("../../../packages/drizzle/migrations/", import.meta.url);
const REPRISE_TAG = "multi_reminders";

interface LegacyAlert {
  eventId: string;
  userId: string;
  dueAt: Date;
  deadlineAt: Date;
  origin: "default" | "user";
  status: "pending" | "sent" | "skipped";
}

export interface MigratedAlert {
  eventId: string;
  reminder: string;
  origin: string;
  dueAt: Date;
  status: string;
  version: number;
}

export interface MigratedPlan {
  eventId: string;
  reminders: unknown;
}

export interface ReminderMigrationOutcome {
  alerts: MigratedAlert[];
  plans: MigratedPlan[];
  readable: boolean;
}

function statementsOf(tag: string): string[] {
  return readFileSync(new URL(`${tag}.sql`, MIGRATIONS), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function migrationTags(): { before: string[]; reprise: string } {
  const journal: { entries: { tag: string }[] } = JSON.parse(
    readFileSync(new URL("meta/_journal.json", MIGRATIONS), "utf8"),
  );
  const tags = journal.entries.map(({ tag }) => tag);
  const at = tags.findIndex((tag) => tag.endsWith(REPRISE_TAG));
  const reprise = tags[at];
  if (at < 0 || reprise === undefined)
    throw new Error(`no ${REPRISE_TAG} migration in the journal`);

  return { before: tags.slice(0, at), reprise };
}

function readable(alerts: MigratedAlert[], plans: MigratedPlan[]): boolean {
  const keys = alerts.every(({ reminder }) => Reminder.fromKey(reminder).isSuccess);
  const lists = plans.every(
    ({ reminders }) =>
      Array.isArray(reminders) && ReminderList.from(reminders).isSuccess && reminders.length === 1,
  );
  return keys && lists;
}

export async function probeReminderMigration(
  legacy: LegacyAlert[],
): Promise<ReminderMigrationOutcome> {
  const { before, reprise } = migrationTags();
  const schema = `reprise_${crypto.randomUUID().replaceAll("-", "")}`;
  const client = await db.$client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}, public`);
    for (const tag of before)
      for (const statement of statementsOf(tag)) await client.query(statement);

    for (const row of legacy)
      await client.query(
        `INSERT INTO alert (event_id, user_id, due_at, deadline_at, origin, status, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          row.eventId,
          row.userId,
          row.dueAt,
          row.deadlineAt,
          row.origin,
          row.status,
          row.status === "sent" ? row.dueAt : null,
        ],
      );

    for (const statement of statementsOf(reprise)) await client.query(statement);

    const alerts = await client.query<MigratedAlert>(
      `SELECT event_id AS "eventId", reminder, origin, due_at AS "dueAt", status, version FROM alert ORDER BY due_at`,
    );
    const plans = await client.query<MigratedPlan>(
      `SELECT event_id AS "eventId", reminders FROM alert_event_reminders`,
    );
    return {
      alerts: alerts.rows,
      plans: plans.rows,
      readable: readable(alerts.rows, plans.rows),
    };
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

import { exitUnlessLocalDatabase } from "@packages/test/db-check";

exitUnlessLocalDatabase("seed-demo", process.env.DATABASE_URL);

import { makeSignature } from "better-auth/crypto";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { shiftInstant } from "../src/dev/demo-dataset";
import { requireFakeProviders, seedDemoFamily } from "./demo-family";

const DEMO_EMAIL = "parent.demo@example.com";

requireFakeProviders("seed-demo");

const family = await seedDemoFamily(DEMO_EMAIL, "demo");
const now = new Date();
const upcoming = await di.EventQueryService.listUpcoming(family.userId, { limit: 50 }, now);
const history = await di.EventQueryService.listHistory(family.userId, { limit: 50 }, now);
const upcomingItems = upcoming.map((page) => page.items).unwrapOr([]);

const defaults = await di.ReminderSettingsService.setDefaults(family.userId, [
  { kind: "days_before", days: 2, time: "18:00" },
  { kind: "days_before", days: 1, time: "19:00" },
]);
const parentChoice = upcomingItems.find(
  (event) => new Date(`${event.deadlineDate}T00:00:00Z`) > shiftInstant(now, 4),
);
const customized = parentChoice
  ? await di.ReminderSettingsService.customizeEvent(family.userId, parentChoice.id, [
      { kind: "days_before", days: 3, time: "18:00" },
      { kind: "days_before", days: 1, time: "07:30" },
    ])
  : undefined;
const reminders = await Promise.all(
  upcomingItems.map((event) => di.ReminderSettingsService.eventReminders(family.userId, event.id)),
);
const planned = reminders
  .flatMap((result) => (result.isSuccess ? result.getValue().reminders : []))
  .filter((reminder) => reminder.status === "pending");

const context = await auth.$context;
const session = await context.internalAdapter.createSession(family.userId);
const signature = await makeSignature(session.token, context.secret);

console.log(
  JSON.stringify(
    {
      parent: DEMO_EMAIL,
      children: family.childIds.length,
      upcoming: upcomingItems.length,
      defaultReminders: defaults.map(({ reminders }) => reminders.length).unwrapOr(0),
      customizedEventReminders:
        customized?.map(({ reminders }) => reminders.length).unwrapOr(0) ?? 0,
      plannedReminders: planned.length,
      history: history.map((page) => page.items.length).unwrapOr(0),
      cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    },
    null,
    2,
  ),
);
process.exit(0);

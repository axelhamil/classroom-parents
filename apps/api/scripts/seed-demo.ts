import { exitUnlessLocalDatabase } from "@packages/test/db-check";

exitUnlessLocalDatabase("seed-demo", process.env.DATABASE_URL);

import { makeSignature } from "better-auth/crypto";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { requireFakeProviders, seedDemoFamily } from "./demo-family";

const DEMO_EMAIL = "parent.demo@example.com";

requireFakeProviders("seed-demo");

const family = await seedDemoFamily(DEMO_EMAIL, "demo");
const now = new Date();
const upcoming = await di.EventQueryService.listUpcoming(family.userId, { limit: 50 }, now);
const history = await di.EventQueryService.listHistory(family.userId, { limit: 50 }, now);
const upcomingItems = upcoming.map((page) => page.items).unwrapOr([]);

const DAY_MS = 86_400_000;
const parentChoice = upcomingItems.find(
  (event) => new Date(`${event.deadlineDate}T00:00:00Z`).getTime() - now.getTime() > 2 * DAY_MS,
);
const parentSet = parentChoice
  ? await di.AlertPlanningService.setUserAlert(family.userId, parentChoice.id, {
      date: new Date(new Date(`${parentChoice.deadlineDate}T12:00:00Z`).getTime() - DAY_MS)
        .toISOString()
        .slice(0, 10),
      time: "07:30",
    })
  : undefined;
const alerts = await Promise.all(
  upcomingItems.map((event) => di.AlertPlanningService.get(family.userId, event.id)),
);

const context = await auth.$context;
const session = await context.internalAdapter.createSession(family.userId);
const signature = await makeSignature(session.token, context.secret);

console.log(
  JSON.stringify(
    {
      parent: DEMO_EMAIL,
      children: family.childIds.length,
      upcoming: upcomingItems.length,
      plannedAlerts: alerts.filter((alert) => alert.isSuccess && alert.getValue().isSome()).length,
      parentSetAlert: parentSet?.isSuccess ?? false,
      history: history.map((page) => page.items.length).unwrapOr(0),
      cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    },
    null,
    2,
  ),
);
process.exit(0);

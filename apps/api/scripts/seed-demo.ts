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

const context = await auth.$context;
const session = await context.internalAdapter.createSession(family.userId);
const signature = await makeSignature(session.token, context.secret);

console.log(
  JSON.stringify(
    {
      parent: DEMO_EMAIL,
      children: family.childIds.length,
      upcoming: upcoming.map((page) => page.items.length).unwrapOr(0),
      history: history.map((page) => page.items.length).unwrapOr(0),
      cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    },
    null,
    2,
  ),
);
process.exit(0);

import { authSchema, db, eq } from "@packages/drizzle";
import { auth } from "../src/auth";
import { seedEmail } from "./seed-account";

const email = seedEmail();
const password = process.env.SEED_PASSWORD ?? "Nimbus-Harbor-42-Quartz";
const name = process.env.SEED_NAME ?? "Dev User";

const existing = await db
  .select()
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);

if (existing.length === 0) {
  await auth.api.signUpEmail({ body: { email, password, name } });
}

await db
  .update(authSchema.user)
  .set({ emailVerified: true })
  .where(eq(authSchema.user.email, email));

const [seeded] = await db
  .select({ id: authSchema.user.id, email: authSchema.user.email })
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);

console.log(JSON.stringify({ seeded, password }, null, 2));
process.exit(0);

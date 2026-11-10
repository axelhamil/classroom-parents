import { authSchema, db } from "@packages/drizzle";
import { CHILD_PROVIDER_ID } from "../../src/application/config/child-provider";
import { childAccount } from "../child.schema";

export interface SeedChildInput {
  userId: string;
  name: string;
  at: Date;
  syncLease?: number;
}

export async function seedChild({ userId, name, at, syncLease }: SeedChildInput): Promise<string> {
  const linkedAccountId = `${userId}-${name}`;
  await db.insert(authSchema.account).values({
    id: linkedAccountId,
    accountId: `sub-${linkedAccountId}`,
    providerId: CHILD_PROVIDER_ID,
    userId,
    updatedAt: at,
  });
  const [child] = await db
    .insert(childAccount)
    .values({
      userId,
      linkedAccountId,
      googleEmail: `${name}@school.example`,
      label: name,
      status: "connected",
      connectedAt: at,
      nextSyncAt: at,
      syncLease,
    })
    .returning({ id: childAccount.id });
  if (!child) throw new Error("child not seeded");

  return child.id;
}

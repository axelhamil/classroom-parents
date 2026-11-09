import { desc, eq, resolveExecutor, schema } from "@packages/drizzle";

export async function findLatestLinkedAccount(userId: string): Promise<
  | {
      id: string;
      providerId: string;
      accountId: string;
      createdAt: Date;
    }
  | undefined
> {
  const [row] = await resolveExecutor()
    .select({
      id: schema.account.id,
      providerId: schema.account.providerId,
      accountId: schema.account.accountId,
      createdAt: schema.account.createdAt,
    })
    .from(schema.account)
    .where(eq(schema.account.userId, userId))
    .orderBy(desc(schema.account.createdAt))
    .limit(1);
  return row;
}

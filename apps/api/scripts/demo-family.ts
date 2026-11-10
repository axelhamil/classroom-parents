import { CHILD_PROVIDER_ID } from "@modules/children/application/config/child-provider";
import { CLASSROOM_SCOPES } from "@modules/children/application/config/classroom-scopes";
import { DATASET_CHILDREN } from "@modules/extraction/eval/classroom-dataset";
import { authSchema, db } from "@packages/drizzle";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { demoRefreshToken } from "../src/dev/demo-dataset";
import { GOOGLE_IDENTITY_SCOPES } from "../src/shared/auth/google-scopes";

const GOOGLE_SIGN_UP = { method: "oauth", oauth: { providerId: "google" } };

export interface DemoFamily {
  userId: string;
  childIds: string[];
}

export function requireFakeProviders(script: string): void {
  if (di.FakeProviders.isSome()) return;

  console.error(`${script} needs FAKE_PROVIDERS=1: it never calls Google or the model`);
  process.exit(1);
}

async function demoParent(email: string): Promise<string> {
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(email);
  if (existing) return existing.user.id;

  const created = await context.internalAdapter.createUser(
    { email, name: "Parent démo", emailVerified: true },
    GOOGLE_SIGN_UP,
  );
  return created.id;
}

async function linkDemoChildren(userId: string, linkPrefix: string): Promise<string[]> {
  const sealing = di.googleTokenSealing;
  const rows = await Promise.all(
    DATASET_CHILDREN.map(async (child) => ({
      id: `${linkPrefix}-${child.key}`,
      accountId: `${linkPrefix}-${child.key}`,
      providerId: CHILD_PROVIDER_ID,
      userId,
      scope: [...GOOGLE_IDENTITY_SCOPES, ...CLASSROOM_SCOPES].join(" "),
      refreshToken: await sealing.seal(demoRefreshToken(child.key)),
    })),
  );
  await db.insert(authSchema.account).values(rows).onConflictDoNothing();

  return rows.map((row) => row.id);
}

export async function seedDemoFamily(email: string, linkPrefix: string): Promise<DemoFamily> {
  const userId = await demoParent(email);

  for (const linkedAccountId of await linkDemoChildren(userId, linkPrefix)) {
    const registered = await di.ChildConnectionService.register(userId, { linkedAccountId });
    if (registered.isFailure && registered.getError().code !== "CHILD_ALREADY_CONNECTED")
      throw new Error(`demo child not registered: ${registered.getError().code}`);
  }

  const synced = await di.ManualSyncService.requestAll(userId);
  if (synced.isFailure) throw new Error(`demo sync refused: ${synced.getError().code}`);
  await di.ManualSyncService.settled();

  const children = await di.ChildConnectionService.list(userId);
  if (children.isFailure) throw new Error(`demo children unreadable: ${children.getError().code}`);

  return { userId, childIds: children.getValue().map((child) => child.id) };
}

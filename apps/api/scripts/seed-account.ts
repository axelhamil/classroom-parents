import { auth } from "../src/auth";

/**
 * The account `pnpm --filter api db:seed` creates, and the target every
 * `check-*.ts` script that needs a real user resolves against.
 *
 * Single source of truth on purpose: the seed and the checks used to carry
 * their own literal, they drifted, and `check:fanout` threw on every fresh
 * clone, a verification gate that does not run is a gate that does not exist.
 * `SEED_EMAIL` overrides both together or neither.
 */
const SEED_EMAIL_FALLBACK = "dev@example.com";

export function seedEmail(): string {
  const override = process.env.SEED_EMAIL?.trim();
  return override && override.length > 0 ? override : SEED_EMAIL_FALLBACK;
}

const GOOGLE_SIGN_UP = { method: "oauth", oauth: { providerId: "google" } };

export async function seedParent(email: string, name: string): Promise<string> {
  const context = await auth.$context;
  const existing = await context.internalAdapter.findUserByEmail(email);
  if (existing) return existing.user.id;

  const created = await context.internalAdapter.createUser(
    { email, name, emailVerified: true },
    GOOGLE_SIGN_UP,
  );
  return created.id;
}

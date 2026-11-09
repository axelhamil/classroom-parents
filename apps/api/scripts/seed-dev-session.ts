import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSignature } from "better-auth/crypto";
import { auth } from "../src/auth";
import { env } from "../src/shared/env";
import { seedEmail } from "./seed-account";

const GOOGLE_SIGN_UP = { method: "oauth", oauth: { providerId: "google" } };
const STORAGE_STATE = fileURLToPath(new URL("../../app/a11y/.auth/state.json", import.meta.url));

const context = await auth.$context;
const email = seedEmail();

const existing = await context.internalAdapter.findUserByEmail(email);
const user =
  existing?.user ??
  (await context.internalAdapter.createUser(
    { email, name: "Dev User", emailVerified: true },
    GOOGLE_SIGN_UP,
  ));

const session = await context.internalAdapter.createSession(user.id);
const signature = await makeSignature(session.token, context.secret);
const { name, attributes } = context.authCookies.sessionToken;

const storageState = {
  cookies: [
    {
      name,
      value: encodeURIComponent(`${session.token}.${signature}`),
      domain: env.COOKIE_DOMAIN ?? new URL(env.BETTER_AUTH_URL).hostname,
      path: "/",
      expires: Math.floor(session.expiresAt.getTime() / 1000),
      httpOnly: true,
      secure: attributes.secure === true,
      sameSite: "Lax",
    },
  ],
  origins: [],
};

await mkdir(dirname(STORAGE_STATE), { recursive: true });
await writeFile(STORAGE_STATE, JSON.stringify(storageState, null, 2));

console.log(JSON.stringify({ seeded: { id: user.id, email }, storageState: STORAGE_STATE }));
process.exit(0);

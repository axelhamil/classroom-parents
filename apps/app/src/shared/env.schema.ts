import { blankAsAbsent } from "@packages/web-kit/env/blank-as-absent";
import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_CONTACT_EMAIL: z.email(),
  VITE_SITE_URL: z.url(),
  VITE_ADMIN_URL: blankAsAbsent(z.url().refine((url) => new URL(url).origin === url)),
  VITE_SENTRY_DSN: blankAsAbsent(z.url()),
  VITE_SENTRY_ENVIRONMENT: blankAsAbsent(z.string()),
  VITE_GIT_SHA: blankAsAbsent(z.string()),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseAppEnv(source: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  throw new Error(`Invalid app environment:\n${z.prettifyError(parsed.error)}`);
}

import { z } from "zod";

const origin = z.url().refine((url) => URL.canParse(url) && new URL(url).origin === url);

const envSchema = z.object({
  PUBLIC_SITE_URL: origin,
  PUBLIC_APP_URL: origin,
});

export type SiteEnv = z.infer<typeof envSchema>;

export function parseSiteEnv(source: Record<string, unknown>): SiteEnv {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  throw new Error(`Invalid site environment:\n${z.prettifyError(parsed.error)}`);
}

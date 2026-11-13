import { z } from "zod";

const origin = z.url().refine((url) => new URL(url).origin === url);

const envSchema = z.object({
  PUBLIC_SITE_URL: origin.default("http://localhost:4181"),
  PUBLIC_APP_URL: origin.default("http://localhost:4177"),
});

export type SiteEnv = z.infer<typeof envSchema>;

export function parseSiteEnv(source: Record<string, unknown>): SiteEnv {
  return envSchema.parse(source);
}

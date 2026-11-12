import { parseSiteEnv } from "./env.schema";

export const env = parseSiteEnv(import.meta.env);

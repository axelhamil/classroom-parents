import { parseAppEnv } from "./env.schema";

export const env = parseAppEnv(import.meta.env);

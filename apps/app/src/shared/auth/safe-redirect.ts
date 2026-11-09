import { createRedirectSearchSchema, toSafeRedirect } from "@packages/web-kit/auth/safe-redirect";
import { env } from "../env";

export const redirectSearchSchema = createRedirectSearchSchema(env.VITE_ADMIN_URL);

export const toAppRedirect = (value: string | undefined): string | undefined =>
  toSafeRedirect(value, env.VITE_ADMIN_URL);

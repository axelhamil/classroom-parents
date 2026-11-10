import { createRedirectSearchSchema } from "@packages/web-kit/auth/safe-redirect";
import { env } from "../env";

export const redirectSearchSchema = createRedirectSearchSchema(env.VITE_ADMIN_URL);

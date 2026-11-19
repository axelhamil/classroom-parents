import { createQueryClient } from "@packages/web-kit/api/query-client";
import { onlineManager } from "@tanstack/react-query";
import { captureError } from "../observability/sentry";

export const queryClient = createQueryClient(captureError);

if (globalThis.navigator?.onLine === false) onlineManager.setOnline(false);

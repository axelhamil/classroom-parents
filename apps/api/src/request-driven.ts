import "./shared/services/sentry-init";

import { EventCollector } from "@packages/ddd-kit";
import { app } from "./app";
import { di } from "./container";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import { afterResponse } from "./shared/services/after-response";
import { lifecycleState } from "./shared/shutdown";

export interface RequestDrivenPlatform {
  waitUntil(work: Promise<unknown>): void;
  clientAddress(request: Request): string;
}

export interface RequestDrivenHandler {
  fetch(request: Request): Promise<Response>;
}

function assertRequestDrivenEnv(): void {
  if (env.NODE_ENV === "production" && env.RATE_LIMIT_STORE === "memory")
    throw new Error(
      "RATE_LIMIT_STORE=memory cannot run request-driven in production: each function instance keeps its own counters, so the limits stop holding. Set RATE_LIMIT_STORE=postgres.",
    );

  if (!env.CRON_SECRET)
    logger.warn(
      "CRON_SECRET is not set: /internal/tick and /internal/sweep answer 404, so due syncs, reminders, digests, retries and sweeps never run in request-driven mode.",
    );
}

export async function createRequestDrivenApp(
  platform: RequestDrivenPlatform,
): Promise<RequestDrivenHandler> {
  assertRequestDrivenEnv();
  EventCollector.setOutOfContextLogger((msg, meta) => logger.warn(meta ?? {}, msg));
  await di.preload();
  lifecycleState.markStarted();

  return {
    fetch: async (request) => {
      const response = await app.fetch(request, {
        clientAddress: platform.clientAddress(request),
      });
      platform.waitUntil(afterResponse(di, request));
      return response;
    },
  };
}

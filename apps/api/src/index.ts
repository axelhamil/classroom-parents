import "./shared/services/sentry-init";

import { EventCollector } from "@packages/ddd-kit";
import { closeDb, closeRateLimitDb } from "@packages/drizzle";
import { type Server, serve } from "bun";
import { app } from "./app";
import { di } from "./container";
import { buildServerOptions } from "./server-options";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import {
  DEADLINE_FLUSH_TIMEOUT_MS,
  drainHttpServer,
  GRACE_MARGIN_MS,
  installShutdown,
  lifecycleState,
  type ShutdownStep,
  TELEMETRY_FLUSH_MARGIN_MS,
  TELEMETRY_FLUSH_TIMEOUT_MS,
} from "./shared/shutdown";
import { startAlertWorkers } from "./workers/alert-worker";
import { startRgpdWorkers } from "./workers/rgpd-worker";
import { startSyncWorkers } from "./workers/sync-worker";

export type { AppType } from "./app";

declare global {
  var apiServer: Server<undefined> | undefined;
  var uninstallApiShutdown: (() => void) | undefined;
  var apiPeriodicWorkers: AbortController | undefined;
}

EventCollector.setOutOfContextLogger((msg, meta) => logger.warn(meta ?? {}, msg));

await di.preload();
await di.OutboxDispatcher.start(di);
await di.EmailDeliveryWorker.start();
await di.NotificationStreamHub.start();

globalThis.apiPeriodicWorkers?.abort();
const periodicWorkers = new AbortController();
globalThis.apiPeriodicWorkers = periodicWorkers;
const periodicLoops = Promise.all([
  startSyncWorkers(di, periodicWorkers.signal, logger),
  startAlertWorkers(di, periodicWorkers.signal, logger),
  startRgpdWorkers(
    di,
    {
      emailRetentionDays: env.EMAIL_RETENTION_DAYS,
      sweepBatchSize: env.RGPD_SWEEP_BATCH_SIZE,
      sweepDeadlineMs: env.SWEEP_DEADLINE_MS,
    },
    periodicWorkers.signal,
    logger,
  ),
]);
lifecycleState.markStarted();

if (env.NODE_ENV === "production" && !env.TRUSTED_PROXIES) {
  logger.warn(
    "TRUSTED_PROXIES is not set in production, behind a load-balancer all requests share the LB socket address as rate-limit key (collective lockout). Set it to `private` (trusts platform private ranges, the right value behind a container proxy such as Traefik on Coolify), a comma-separated CIDR list, or exact proxy IPs.",
  );
}

const serveOptions = {
  ...buildServerOptions({ port: env.PORT, idleTimeoutSeconds: env.SERVER_IDLE_TIMEOUT_SECONDS }),
  fetch: app.fetch,
};
const running = globalThis.apiServer;
running?.reload(serveOptions);
const server = running ?? serve(serveOptions);
globalThis.apiServer = server;

const steps: ShutdownStep[] = [
  {
    name: "signal-and-grace",
    timeoutMs: env.SHUTDOWN_GRACE_PERIOD_MS + GRACE_MARGIN_MS,
    run: async () => {
      lifecycleState.signalShutdown();
      await new Promise<void>((resolve) => setTimeout(resolve, env.SHUTDOWN_GRACE_PERIOD_MS));
    },
  },
  {
    name: "http",
    timeoutMs: env.SHUTDOWN_STEP_TIMEOUT_MS,
    run: () => drainHttpServer(server, env.SHUTDOWN_STEP_TIMEOUT_MS),
  },
  {
    name: "workers",
    timeoutMs: env.SHUTDOWN_WORKERS_TIMEOUT_MS,
    run: async () => {
      periodicWorkers.abort();
      await Promise.all([
        periodicLoops,
        di.ManualSyncService.settled(),
        di.EmailDeliveryWorker.stop(),
        di.OutboxDispatcher.stop(),
        di.NotificationStreamHub.stop(),
      ]);
    },
  },
  {
    name: "database-pool",
    timeoutMs: env.SHUTDOWN_STEP_TIMEOUT_MS,
    skipAfterTimeoutOf: "workers",
    run: async () => {
      await Promise.all([closeDb(), closeRateLimitDb()]);
    },
  },
  {
    name: "telemetry-flush",
    timeoutMs: TELEMETRY_FLUSH_TIMEOUT_MS + TELEMETRY_FLUSH_MARGIN_MS,
    run: async () => {
      const flushed = await di.IInstrumentation.flush(TELEMETRY_FLUSH_TIMEOUT_MS);
      if (!flushed) logger.warn("telemetry flush timed out, some events were dropped");
    },
  },
];

globalThis.uninstallApiShutdown?.();
globalThis.uninstallApiShutdown = installShutdown(steps, {
  deadlineMs: env.SHUTDOWN_DEADLINE_MS,
  logger,
  exit: (code) => process.exit(code),
  flushOnDeadline: async () => {
    await di.IInstrumentation.flush(DEADLINE_FLUSH_TIMEOUT_MS);
  },
});

logger.info({ port: server.port, env: env.NODE_ENV }, "api ready");

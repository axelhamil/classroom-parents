/**
 * The pieces every `check-*.ts` script used to redeclare: a pass/fail recorder and a
 * fail-fast step runner, a span recorder, and a signed request to an `/internal/*`
 * route mounted on a throwaway app. One copy, so a fix to how a check reports or signs
 * lands everywhere.
 */

import { Writable } from "node:stream";
import type { IInstrumentation } from "@packages/ddd-kit";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { pino } from "pino";
import { env } from "../src/shared/env";
import {
  buildSignatureHeader,
  canonicalize,
  SIGNATURE_HEADER,
  sign,
} from "../src/shared/internal-routes/internal-signature";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

export interface CheckRecorder {
  check(label: string, ok: boolean, extra?: unknown): void;
  readonly failures: number;
}

export function checkRecorder(): CheckRecorder {
  let failures = 0;

  return {
    check(label, ok, extra) {
      const suffix = extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`;
      console.log(`${ok ? "  OK" : "  FAIL"}: ${label}${suffix}`);
      if (!ok) failures += 1;
    },
    get failures() {
      return failures;
    },
  };
}

export interface CheckRun {
  step(label: string, ok: boolean, extra?: unknown): Promise<void>;
  fail(label: string, extra?: unknown): Promise<never>;
  run(main: () => Promise<void>, success: string): void;
}

export function checkRun(name: string, cleanup: () => Promise<void>): CheckRun {
  const checks = checkRecorder();

  async function fail(label: string, extra?: unknown): Promise<never> {
    checks.check(label, false, extra);
    await cleanup();
    console.error(`\n${name} failed at: ${label}`);
    process.exit(1);
  }

  return {
    fail,
    async step(label, ok, extra) {
      if (!ok) await fail(label, extra);
      checks.check(label, true);
    },
    run(main, success) {
      main()
        .then(async () => {
          await cleanup();
          console.log(`\nAll assertions passed, ${success}.`);
          process.exit(0);
        })
        .catch(async (err) => {
          console.error(`${name} crashed:`, err);
          await cleanup().catch(() => {});
          process.exit(1);
        });
    },
  };
}

export function recordingInstrumentation(): { instrumentation: IInstrumentation; spans: string[] } {
  const spans: string[] = [];
  const instrumentation: IInstrumentation = Object.assign(new NoOpInstrumentation(), {
    startSpan: <T>(options: { name: string; op?: string }, work: () => T): T => {
      if (options.op === "db.query") spans.push(options.name);
      return work();
    },
  });

  return { instrumentation, spans };
}

/**
 * Mounts internal routes under `/internal` behind a logger that writes nowhere, or
 * into `lines` when the check needs to read what the route logged.
 */
export function internalApp(routes: Hono, lines?: string[]): Hono {
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines?.push(chunk.toString());
      callback();
    },
  });

  const app = new Hono();
  app.use("*", pinoLogger({ pino: pino(sink) }));
  app.route("/internal", routes);
  return app;
}

/** A POST signed exactly the way `requireInternalSignature` verifies it. */
export async function signedInternalRequest(
  app: Hono,
  path: string,
  body: unknown,
): Promise<Response> {
  const key = env.INTERNAL_SIGNING_KEY;
  if (!key) throw new Error("INTERNAL_SIGNING_KEY is not set, cannot sign a request");

  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(
    canonicalize({
      timestamp,
      method: "POST",
      path,
      host: "localhost",
      contentType: "application/json",
      rawBody,
    }),
    key,
  );

  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      [SIGNATURE_HEADER]: buildSignatureHeader(timestamp, signature),
    },
    body: rawBody,
  });
}

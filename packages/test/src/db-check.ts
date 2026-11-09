import type { IInstrumentation } from "@packages/ddd-kit";

const PROJECT_PORT = "54329";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const PROJECT_DATABASE_NAME = /^classroom_parents(_[a-z0-9_]+)?$/;

export function requireLocalDatabase(databaseUrl: string | undefined): void {
  const url = URL.parse(databaseUrl ?? "");
  if (!url) throw new Error("DATABASE_URL is missing or not a URL, run scripts/worktree-db.sh");

  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`DATABASE_URL host must be localhost or 127.0.0.1, got ${url.hostname}`);
  }

  if (url.port !== PROJECT_PORT) {
    throw new Error(`DATABASE_URL port must be ${PROJECT_PORT}, got ${url.port || "default"}`);
  }

  const name = url.pathname.slice(1);
  if (!PROJECT_DATABASE_NAME.test(name)) {
    throw new Error(`DATABASE_URL database must match classroom_parents[_<slug>], got ${name}`);
  }
}

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

export interface StepRunner {
  step(label: string, ok: boolean, extra?: unknown): Promise<void>;
  fail(label: string, extra?: unknown): Promise<never>;
  run(main: () => Promise<void>, success: string): void;
}

export function stepRunner(name: string, cleanup: () => Promise<void>): StepRunner {
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

export function spanRecorder(): { instrumentation: IInstrumentation; spans: string[] } {
  const spans: string[] = [];
  const instrumentation: IInstrumentation = {
    startSpan: (options, work) => {
      if (options.op === "db.query") spans.push(options.name);
      return work();
    },
    capture: () => {},
    addBreadcrumb: () => {},
    setSpanAttributes: () => {},
    flush: () => Promise.resolve(true),
  };

  return { instrumentation, spans };
}

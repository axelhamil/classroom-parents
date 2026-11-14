import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, type Plugin } from "esbuild";

type Env = Readonly<Record<string, string | undefined>>;

export type MigrationPlan = { run: false; reason: string } | { run: true; databaseUrl: string };

export function migrationPlan(env: Env): MigrationPlan {
  if (env.VERCEL_ENV !== "production")
    return {
      run: false,
      reason: `VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}: only a production deployment migrates the database`,
    };

  const databaseUrl = env.DATABASE_URL_DIRECT;
  if (!databaseUrl)
    throw new Error(
      "DATABASE_URL_DIRECT is required to migrate a production deployment: a transaction pooler cannot run the migration's DDL in one session.",
    );

  return { run: true, databaseUrl };
}

export const RATE_LIMITER_DRIZZLE_FILE = join(
  dirname(fileURLToPath(import.meta.resolve("rate-limiter-flexible"))),
  "lib",
  "RateLimiterDrizzle.js",
);

const COMPUTED_DRIZZLE_IMPORTS = [
  /* biome-ignore lint/suspicious/noTemplateCurlyInString: the library's source text, matched verbatim */
  ["importModule(`${getPackageName()}`)", 'import("drizzle-orm")'],
  /* biome-ignore lint/suspicious/noTemplateCurlyInString: the library's source text, matched verbatim */
  ["importModule(`${getPackageName()}/sql`, { optional: true })", 'import("drizzle-orm/sql")'],
] as const;

export function literalDrizzleImports(source: string): string {
  return COMPUTED_DRIZZLE_IMPORTS.reduce((code, [computed, literal]) => {
    if (!code.includes(computed))
      throw new Error(
        `rate-limiter-flexible no longer loads drizzle-orm through ${computed}: update literalDrizzleImports, or the bundled rate limiter cannot find drizzle-orm and fails open.`,
      );

    return code.replace(computed, literal);
  }, source);
}

const bundledRateLimiterDrizzle: Plugin = {
  name: "bundled-rate-limiter-drizzle",
  setup(bundle) {
    bundle.onLoad({ filter: /RateLimiterDrizzle\.js$/ }, async (args) => ({
      contents: literalDrizzleImports(await readFile(args.path, "utf8")),
      loader: "js",
    }));
  },
};

async function bundle(entry: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "esnext",
    external: ["bun", "pg-native"],
    banner: {
      js: "import { createRequire as bundleRequire } from 'node:module'; const require = bundleRequire(import.meta.url);",
    },
    logLevel: "info",
    logOverride: { "ignored-bare-import": "silent" },
    plugins: [bundledRateLimiterDrizzle],
  });
}

const ENV_GUARD_FILE = "dist/vercel-env.js";

async function productionEnvStatus(env: Env): Promise<number> {
  if (env.VERCEL_ENV !== "production") return 0;

  await bundle("src/vercel-env.ts", ENV_GUARD_FILE);
  const guard: typeof import("../src/vercel-env") = await import(
    pathToFileURL(ENV_GUARD_FILE).href
  );
  const issues = guard.productionEnvIssues(env);
  if (issues.length === 0) return 0;

  console.error(
    `the production environment is incomplete, nothing was migrated and the deployment stops here:\n${issues.map((issue) => `  ${issue}`).join("\n")}`,
  );
  return 1;
}

function migrate(env: Env): number {
  const plan = migrationPlan(env);
  if (!plan.run) {
    console.log(`skipping migrations, ${plan.reason}`);
    return 0;
  }

  console.log("applying the committed migrations to the production database");
  const migration = spawnSync("pnpm", ["--filter", "@packages/drizzle", "run", "db:migrate"], {
    stdio: "inherit",
    env: { ...env, DATABASE_URL: plan.databaseUrl },
  });
  if (migration.status === 0) return 0;

  console.error(
    "migration failed: the deployment stops here and production keeps serving the previous one",
  );
  return migration.status ?? 1;
}

if (import.meta.main) {
  await bundle("src/vercel-function.ts", "dist/vercel-function.js");
  process.exit((await productionEnvStatus(process.env)) || migrate(process.env));
}

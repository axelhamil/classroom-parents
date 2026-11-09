import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createSourceScan,
  LAYER_GUARDS,
  type LayerGuard,
  type LayerGuardName,
} from "@packages/test/source-scan";

const apiSrcRoot = join(import.meta.dir, "..");
const scan = createSourceScan(apiSrcRoot);

const ENV_OWNER = "shared/env.ts";

const ALLOWED_ENV_READERS: Record<string, string> = {};

const ALLOWED_TX_PARAMETERS: Record<string, string> = {};

const ALLOWED_TRANSACTION_OPENERS: Record<string, string> = {};

const COMPOSED_MODULES = ["rgpd"];

const HOST_REACH = [
  /from\s+["'][./]*container["']/,
  /from\s+["'][./]*auth["']/,
  /from\s+["'][./]*shared\/env["']/,
  /from\s+["'][./]*shared\/middleware\//,
  /declare\s+module\s+["']inwire["']/,
];

const modules = readdirSync(join(apiSrcRoot, "modules"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `modules/${entry.name}`);

function layersNamed(name: string): string[] {
  return modules
    .map((module) => `${module}/${name}`)
    .filter((layer) => existsSync(join(apiSrcRoot, layer)));
}

function isRouteFile(file: string): boolean {
  const name = file.split("/").at(-1) ?? "";

  return name === "routes.ts" || name.endsWith(".routes.ts");
}

function staleAllowances(allowed: Record<string, string>, found: Record<string, number>): string[] {
  return Object.keys(allowed)
    .filter((file) => !(file in found))
    .map((file) => `stale allowance: ${file}`);
}

function countIn(guard: LayerGuard, layers: string[]): Record<string, number> {
  return Object.assign({}, ...layers.map((layer) => guard.count(scan, layer)));
}

const API_OFFENDERS: Record<LayerGuardName, (guard: LayerGuard) => string[]> = {
  noThrow: (guard) => {
    const layers = [...layersNamed("domain"), ...layersNamed("application")];
    if (layers.length === 0) return ["no domain or application layer found"];

    return Object.keys(countIn(guard, layers));
  },
  noEnvRead: (guard) => {
    const reads = countIn(guard, ["."]);
    const strays = Object.keys(reads).filter(
      (file) => file !== ENV_OWNER && !(file in ALLOWED_ENV_READERS),
    );
    const ownerReads = ENV_OWNER in reads ? [] : [`${ENV_OWNER} reads no environment`];

    return [...strays, ...ownerReads, ...staleAllowances(ALLOWED_ENV_READERS, reads)];
  },
  noTransactionParameter: (guard) => {
    const declared = countIn(guard, ["modules", "shared"]);
    const strays = Object.keys(declared).filter((file) => !(file in ALLOWED_TX_PARAMETERS));

    return [...strays, ...staleAllowances(ALLOWED_TX_PARAMETERS, declared)];
  },
  readOnlyRoutes: (guard) => {
    if (!scan.sourceFiles("modules").some(isRouteFile)) return ["no route file found"];

    return Object.keys(countIn(guard, ["modules"])).filter(isRouteFile);
  },
};

describe("layering rules of the api", () => {
  for (const guard of Object.values(LAYER_GUARDS)) {
    it(guard.rule, () => {
      expect(API_OFFENDERS[guard.name](guard)).toEqual([]);
    });
  }

  it("db.transaction is called only inside packages/drizzle and scripts", () => {
    const openers = scan.transactionOpenersPerFile(".");

    const strayOpeners = Object.keys(openers).filter(
      (file) => !(file in ALLOWED_TRANSACTION_OPENERS),
    );

    expect([...strayOpeners, ...staleAllowances(ALLOWED_TRANSACTION_OPENERS, openers)]).toEqual([]);
  });

  it("a composed module reaches the host only through its prerequisites and route deps", () => {
    const reaches = COMPOSED_MODULES.flatMap((module) =>
      scan.sourceFiles(`modules/${module}`),
    ).filter((file) => HOST_REACH.some((pattern) => pattern.test(scan.codeOf(file))));

    expect(reaches).toEqual([]);
  });
});

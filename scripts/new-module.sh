#!/usr/bin/env bash
set -euo pipefail

# Scaffolds modules/<name> as an empty @modules/<name> package: manifest, tsconfig, an empty
# defineModule and its layering test. Run `pnpm install` afterwards to link the workspace.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
name="${1:-}"

if [[ ! "$name" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  echo "usage: scripts/new-module.sh <kebab-case-name>" >&2
  exit 1
fi

dir="$ROOT/modules/$name"
if [ -e "$dir" ]; then
  echo "modules/$name already exists" >&2
  exit 1
fi

pascal="$(echo "$name" | sed -E 's/(^|-)([a-z0-9])/\U\2/g')"
camel="$(echo "${pascal:0:1}" | tr '[:upper:]' '[:lower:]')${pascal:1}"

mkdir -p "$dir/src/__TESTS__"

cat >"$dir/package.json" <<EOF
{
  "name": "@modules/$name",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./$name.module": "./src/$name.module.ts",
    "./schemas/*": "./schemas/*.ts",
    "./infrastructure/http/*.routes": "./src/infrastructure/http/*.routes.ts"
  },
  "scripts": {
    "test": "bun test --isolate",
    "type-check": "tsc --noEmit",
    "check": "biome check ."
  },
  "dependencies": {
    "@packages/ddd-kit": "workspace:*",
    "@packages/drizzle": "workspace:*",
    "@packages/events": "workspace:*",
    "@packages/http": "workspace:*",
    "@packages/outbox": "workspace:*",
    "drizzle-orm": "^0.45.4",
    "hono": "^4.13.14",
    "inwire": "^4.0.1",
    "zod": "^4.6.7"
  },
  "devDependencies": {
    "@packages/test": "workspace:*",
    "@packages/typescript-config": "workspace:*",
    "@types/bun": "^1.4.4",
    "typescript": "^7.0.2"
  }
}
EOF

cat >"$dir/tsconfig.json" <<EOF
{
  "extends": "@packages/typescript-config/hono.json",
  "include": ["src/**/*.ts", "schemas/**/*.ts", "scripts/**/*.ts", "eval/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat >"$dir/src/$name.module.ts" <<EOF
import { defineModule } from "inwire";

export type ${pascal}Prerequisites = Record<never, never>;

export const ${camel}Module = defineModule<${pascal}Prerequisites>()((b) => b);
EOF

cat >"$dir/src/__TESTS__/layering.test.ts" <<EOF
import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createSourceScan } from "@packages/test/source-scan";

const moduleRoot = join(import.meta.dir, "../..");
const scan = createSourceScan(moduleRoot);

function existing(layers: string[]): string[] {
  return layers.filter((layer) => existsSync(join(moduleRoot, layer)));
}

function offenders(layers: string[], count: (layer: string) => Record<string, number>): string[] {
  return existing(layers).flatMap((layer) => Object.keys(count(layer)));
}

describe("layering rules of the $name module", () => {
  it("domain and application never throw", () => {
    expect(offenders(["src/domain", "src/application"], scan.throwsPerFile)).toEqual([]);
  });

  it("reads no environment, the host passes settings as prerequisites", () => {
    expect(scan.sourceFiles("src").length).toBeGreaterThan(0);
    expect(offenders(["src", "schemas"], scan.envReadsPerFile)).toEqual([]);
  });

  it("declares no transaction parameter, stores read the ambient one", () => {
    expect(offenders(["src"], scan.transactionParametersPerFile)).toEqual([]);
  });

  it("routes never write, they go through a service", () => {
    expect(offenders(["src/infrastructure/http"], scan.writeCallsPerFile)).toEqual([]);
  });
});
EOF

echo "created modules/$name, run pnpm install"

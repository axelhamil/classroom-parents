#!/usr/bin/env bash
set -euo pipefail

# Scaffolds modules/<name> as an empty @modules/<name> package: manifest, tsconfig, an empty
# defineModule and its layering test, then links it at the root so every workspace resolves
# @modules/<name>/schemas/* for a foreign key.

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

pascal="$(printf '%s' "$name" | awk -F- '{ for (i = 1; i <= NF; i++) printf "%s%s", toupper(substr($i, 1, 1)), substr($i, 2) }')"
camel="$(printf '%s' "$pascal" | awk '{ printf "%s%s", tolower(substr($0, 1, 1)), substr($0, 2) }')"

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
import { describe, it } from "bun:test";
import { join } from "node:path";
import { assertModuleLayering } from "@packages/test/source-scan";

describe("layering rules of the $name module", () => {
  it("keeps every layer guard of a module", () => {
    assertModuleLayering(join(import.meta.dir, "../.."));
  });
});
EOF

cd "$ROOT"
pnpm add -D -w "@modules/$name@workspace:*"

echo "created modules/$name"

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cruise } from "dependency-cruiser";
import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CONFIG = join(import.meta.dirname, "../../../../.dependency-cruiser.cjs");

const tree = mkdtempSync(join(tmpdir(), "boundaries-"));

const FILES: Record<string, string> = {
  "modules/b/package.json": JSON.stringify({
    name: "@modules/b",
    type: "module",
    exports: { "./schemas/*": "./schemas/*.ts" },
  }),
  "modules/b/src/y.ts": "export const y = 1;\n",
  "modules/b/schemas/s.ts": "export const parent = 1;\n",
  "modules/a/src/x.ts": 'import { y } from "../../b/src/y";\nexport const x = y;\n',
  "modules/a/schemas/s.ts":
    'import { parent } from "@modules/b/schemas/s";\nexport const child = parent;\n',
  "modules/a/schemas/code.ts": 'import { y } from "../../b/src/y";\nexport const code = y;\n',
  "modules/a/scripts/check-seed.ts":
    'import { parent } from "@modules/b/schemas/s";\nexport const seed = parent;\n',
  "modules/a/scripts/check-code.ts": 'import { y } from "../../b/src/y";\nexport const code = y;\n',
};

let violations: { from: string; rule: string }[] = [];
let resolved: Record<string, string[]> = {};

function rulesBrokenBy(from: string): string[] {
  return violations.filter((violation) => violation.from === from).map(({ rule }) => rule);
}

beforeAll(async () => {
  for (const [path, content] of Object.entries(FILES)) {
    mkdirSync(dirname(join(tree, path)), { recursive: true });
    writeFileSync(join(tree, path), content);
  }

  mkdirSync(join(tree, "node_modules/@modules"), { recursive: true });
  symlinkSync(join(tree, "modules/b"), join(tree, "node_modules/@modules/b"), "dir");

  const options = await extractDepcruiseOptions(CONFIG);
  const { output } = await cruise(["modules"], { ...options, baseDir: tree, validate: true });

  if (typeof output === "string") throw new Error("dependency-cruiser returned a text report");

  resolved = Object.fromEntries(
    output.modules.map((module) => [
      module.source,
      module.dependencies.map((dependency) => dependency.resolved),
    ]),
  );
  violations = output.summary.violations.map(({ from, rule }) => ({ from, rule: rule.name }));
});

afterAll(() => {
  rmSync(tree, { recursive: true, force: true });
});

describe("module boundaries", () => {
  it("forbids a module's code from importing another module's code", () => {
    expect(rulesBrokenBy("modules/a/src/x.ts")).toContain("no-cross-module-import");
  });

  it("lets a schema import another module's schema through its package", () => {
    expect(resolved["modules/a/schemas/s.ts"]).toEqual(["modules/b/schemas/s.ts"]);
    expect(rulesBrokenBy("modules/a/schemas/s.ts")).toEqual([]);
  });

  it("forbids a schema from importing another module's code", () => {
    expect(rulesBrokenBy("modules/a/schemas/code.ts")).toContain(
      "schemas-reach-only-other-schemas",
    );
  });

  it("lets a real-database script seed another module's tables through its schemas", () => {
    expect(resolved["modules/a/scripts/check-seed.ts"]).toEqual(["modules/b/schemas/s.ts"]);
    expect(rulesBrokenBy("modules/a/scripts/check-seed.ts")).toEqual([]);
  });

  it("forbids a real-database script from importing another module's code", () => {
    expect(rulesBrokenBy("modules/a/scripts/check-code.ts")).toContain(
      "tests-and-scripts-reach-other-modules-schemas-only",
    );
  });
});

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cruise } from "dependency-cruiser";
import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = join(import.meta.dirname, "../../../..");
const CONFIG = join(REPO, ".dependency-cruiser.cjs");

const tree = mkdtempSync(join(tmpdir(), "boundaries-"));

const FILES: Record<string, string> = {
  "modules/b/src/y.ts": "export const y = 1;\n",
  "modules/b/schemas/s.ts": "export const parent = 1;\n",
  "modules/a/src/x.ts": 'import { y } from "../../b/src/y";\nexport const x = y;\n',
  "modules/a/schemas/s.ts":
    'import { parent } from "../../b/schemas/s";\nexport const child = parent;\n',
  "modules/a/schemas/code.ts": 'import { y } from "../../b/src/y";\nexport const code = y;\n',
  "modules/a/scripts/check-seed.ts":
    'import { parent } from "../../b/schemas/s";\nexport const seed = parent;\n',
  "modules/a/scripts/check-code.ts": 'import { y } from "../../b/src/y";\nexport const code = y;\n',
};

const modules = readdirSync(join(REPO, "modules"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

let violations: { from: string; rule: string }[] = [];

const RESOLVE_PAIRS = `
const { createRequire } = require("node:module");
const { join } = require("node:path");
const [repo, pairs] = [process.argv[1], JSON.parse(process.argv[2])];
const resolved = pairs.map(([importer, name]) => {
  try {
    return createRequire(join(repo, importer, "probe.js")).resolve(\`@modules/\${name}/\${name}.module\`);
  } catch {
    return \`unresolved from \${importer}\`;
  }
});
process.stdout.write(JSON.stringify(resolved));
`;

function resolveInFreshNode(pairs: string[][]): string[] {
  return JSON.parse(
    execFileSync(process.execPath, ["-e", RESOLVE_PAIRS, REPO, JSON.stringify(pairs)], {
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
    }),
  );
}

function rulesBrokenBy(from: string): string[] {
  return violations.filter((violation) => violation.from === from).map(({ rule }) => rule);
}

beforeAll(async () => {
  for (const [path, content] of Object.entries(FILES)) {
    mkdirSync(dirname(join(tree, path)), { recursive: true });
    writeFileSync(join(tree, path), content);
  }

  const options = await extractDepcruiseOptions(CONFIG);
  const { output } = await cruise(["modules"], { ...options, baseDir: tree, validate: true });

  if (typeof output === "string") throw new Error("dependency-cruiser returned a text report");

  violations = output.summary.violations.map(({ from, rule }) => ({ from, rule: rule.name }));
});

afterAll(() => {
  rmSync(tree, { recursive: true, force: true });
});

describe("module boundaries", () => {
  it("forbids a module's code from importing another module's code", () => {
    expect(rulesBrokenBy("modules/a/src/x.ts")).toContain("no-cross-module-import");
  });

  it("lets a schema import another module's schema", () => {
    expect(rulesBrokenBy("modules/a/schemas/s.ts")).toEqual([]);
  });

  it("forbids a schema from importing another module's code", () => {
    expect(rulesBrokenBy("modules/a/schemas/code.ts")).toContain(
      "schemas-reach-only-other-schemas",
    );
  });

  it("lets a real-database script seed another module's tables through its schemas", () => {
    expect(rulesBrokenBy("modules/a/scripts/check-seed.ts")).toEqual([]);
  });

  it("forbids a real-database script from importing another module's code", () => {
    expect(rulesBrokenBy("modules/a/scripts/check-code.ts")).toContain(
      "tests-and-scripts-reach-other-modules-schemas-only",
    );
  });
});

describe("module packages in this repository", () => {
  it("each publishes its schemas under @modules/<name>/schemas/*", () => {
    expect(modules.length).toBeGreaterThan(0);

    for (const name of modules) {
      const manifest = JSON.parse(
        readFileSync(join(REPO, "modules", name, "package.json"), "utf8"),
      );

      expect(manifest.name).toBe(`@modules/${name}`);
      expect(manifest.exports["./schemas/*"]).toBe("./schemas/*.ts");
    }
  });

  it("each resolves by package name from every other module and from the api", () => {
    const importers = [...modules.map((name) => `modules/${name}/schemas`), "apps/api/src/queries"];
    const pairs = importers.flatMap((importer) => modules.map((name) => [importer, name]));

    expect(resolveInFreshNode(pairs)).toEqual(
      pairs.map(([, name]) => join(REPO, "modules", `${name}`, "src", `${name}.module.ts`)),
    );
  });
});

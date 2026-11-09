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

describe("layering rules of the extraction module", () => {
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

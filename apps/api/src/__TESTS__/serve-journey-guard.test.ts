import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { spawn } from "bun";

const SCRIPT = fileURLToPath(new URL("../../scripts/serve-journey.ts", import.meta.url));

async function serveJourney(env: Record<string, string>) {
  const run = spawn(["bun", SCRIPT], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: "3158",
      JOURNEY_CONTROL_PORT: "3157",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    run.exited,
    new Response(run.stdout).text(),
    new Response(run.stderr).text(),
  ]);

  return { code, stdout, stderr };
}

describe("serve-journey refuses before the api boots", () => {
  it("a foreign database", async () => {
    const run = await serveJourney({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54329/someone_else",
      FAKE_PROVIDERS: "0",
    });

    expect(run.code).toBe(1);
    expect(run.stderr).toContain("serve-journey refused to run");
    expect(run.stdout).toBe("");
  }, 20_000);
});

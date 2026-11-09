import { describe, expect, it } from "bun:test";
import { join } from "node:path";

describe("env at boot", () => {
  it("reads a blank COOKIE_DOMAIN as absent", async () => {
    // biome-ignore lint/correctness/noUndeclaredVariables: Bun global available at runtime
    const boot = Bun.spawn(
      [
        process.execPath,
        "-e",
        'const { env } = await import("./src/shared/env.ts"); console.log(JSON.stringify([env.COOKIE_DOMAIN ?? null]));',
      ],
      {
        cwd: join(import.meta.dir, "../../.."),
        env: {
          ...process.env,
          NODE_ENV: "development",
          COOKIE_DOMAIN: "",
          APP_ORIGIN: "http://localhost:5173",
          BETTER_AUTH_URL: "http://localhost:3000",
          BETTER_AUTH_SECRET: "a".repeat(40),
          DATABASE_URL: "postgres://user:pass@localhost:54329/db",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(await new Response(boot.stdout).text()).toContain("[null]");
    expect(await boot.exited).toBe(0);
  });
});

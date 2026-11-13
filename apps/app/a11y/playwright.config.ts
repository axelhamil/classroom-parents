import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4173";
const PREVIEW = new URL(BASE_URL);
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

export const STORAGE_STATE = fileURLToPath(new URL(".auth/state.json", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
  // `workers` is a courtesy cap on machine load, NOT what keeps the API's global
  // rate limit off this suite. Every authenticated test signs in as the one seeded
  // parent, so the bucket a full sweep fills is that parent's (`global:<userId>`);
  // the IP bucket only takes `/api/auth/*` and the public pages. Measured over a full
  // sweep at 4 workers: 337 requests in the parent's bucket in under a minute (the
  // signed-in home alone costs 9) against a then-300/min ceiling, so the settings
  // queries were refused and their toast covered the tour buttons; 131 in the IP
  // bucket. Worker count bounds neither: the whole sweep fits in one window, so its
  // request count is what matters. The fix was to tune the API's burst window to what
  // opening the app costs (`GLOBAL_POLICY`, apps/api/src/shared/middleware/
  // rate-limit.policies.ts); this number just keeps the host from being swamped.
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "audit",
      testMatch: /\.spec\.ts$/,
      testIgnore: /journey\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm preview --host ${PREVIEW.hostname} --port ${PREVIEW.port} --strictPort`,
    cwd: APP_ROOT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

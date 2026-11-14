import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4182";
const PREVIEW = new URL(BASE_URL);
const SITE_ROOT = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  fullyParallel: true,
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `pnpm preview --host ${PREVIEW.hostname} --port ${PREVIEW.port} --strictPort`,
    cwd: SITE_ROOT,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

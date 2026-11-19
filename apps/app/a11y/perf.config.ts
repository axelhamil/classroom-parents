import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./playwright.config";

const PREVIEW = new URL(BASE_URL);
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: /perf\.spec\.ts$/,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    { name: "perf", testMatch: /perf\.spec\.ts$/, dependencies: ["setup"] },
  ],
  webServer: {
    command: `pnpm preview --host ${PREVIEW.hostname} --port ${PREVIEW.port} --strictPort`,
    cwd: APP_ROOT,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

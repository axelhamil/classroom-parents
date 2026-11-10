import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

export const JOURNEY_APP_URL = process.env.JOURNEY_APP_URL ?? "http://localhost:4183";
export const JOURNEY_API_URL = process.env.JOURNEY_API_URL ?? "http://localhost:3183";
const CONTROL_PORT = process.env.JOURNEY_CONTROL_PORT ?? "3189";
export const JOURNEY_CONTROL_URL = `http://127.0.0.1:${CONTROL_PORT}`;

const APP = new URL(JOURNEY_APP_URL);
const API = new URL(JOURNEY_API_URL);
const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const API_ROOT = fileURLToPath(new URL("../../api", import.meta.url));
const BUILD_DIR = "dist/journey";

export default defineConfig({
  testDir: fileURLToPath(new URL(".", import.meta.url)),
  testMatch: /journey\.spec\.ts$/,
  workers: 1,
  timeout: 180_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    ...devices["Pixel 7"],
    baseURL: JOURNEY_APP_URL,
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm serve:journey",
      cwd: API_ROOT,
      url: `${JOURNEY_API_URL}/readyz`,
      env: {
        PORT: API.port,
        BETTER_AUTH_URL: JOURNEY_API_URL,
        APP_ORIGIN: JOURNEY_APP_URL,
        CORS_ORIGIN: JOURNEY_APP_URL,
        JOURNEY_CONTROL_PORT: CONTROL_PORT,
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite build --outDir ${BUILD_DIR} && pnpm exec vite preview --outDir ${BUILD_DIR} --host ${APP.hostname} --port ${APP.port} --strictPort`,
      cwd: APP_ROOT,
      url: JOURNEY_APP_URL,
      env: { VITE_API_URL: JOURNEY_API_URL },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});

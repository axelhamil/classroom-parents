import { resolve } from "node:path";
import baseConfig from "@packages/test/base-vitest.config";
import { defineConfig, mergeConfig } from "vitest/config";

/**
 * Every test runs on a device in UTC (where CI runs) and in Paris (where parents are): a test that
 * reads the device's wall clock instead of a pinned instant fails here, not first in CI.
 */
const DEVICE_TIME_ZONES = ["UTC", "Europe/Paris"] as const;

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      globals: true,
      passWithNoTests: true,
      // a11y/ holds Playwright specs; vitest's default glob would collect them and
      // fail on the first test.describe().
      exclude: ["a11y/**"],
      setupFiles: ["./src/__tests__/setup.ts"],
      // `TZ` only reaches `Date` in a forked worker: a worker thread keeps the time zone of the
      // main process, so a project's zone would silently be ignored.
      pool: "forks",
      // A test renders the whole app in jsdom: under 1 s alone, but the pre-push chain runs every
      // package's suite at once and this one twice, which stretched a render past the 5 s default
      // (measured 6.2 s). The bound still catches a hang.
      testTimeout: 15_000,
      projects: DEVICE_TIME_ZONES.map((zone) => ({
        extends: true,
        test: { name: zone, env: { TZ: zone } },
      })),
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  }),
);

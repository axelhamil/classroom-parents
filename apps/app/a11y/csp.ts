import { test as base, expect } from "@playwright/test";
import { todayAt } from "./events-fixtures";

export interface GateOptions {
  /**
   * Pins what every page's school clock reads: the gate's school day at 9:00 (a spec may still set
   * its own instant), Paris as the parent's zone and no school zone, so no holiday. Those two reads
   * run on every page, so leaving them to the live API also spends the seeded parent's rate limit.
   */
  pinSchoolClock: boolean;
}

const CLOCK_READS: Record<string, unknown> = {
  "/assistant/preferences": {
    locale: null,
    timeZone: null,
    country: null,
    extractionEnabled: true,
  },
  "/school-calendar": { zone: null, holidays: [], bankHolidays: [] },
};

export const test = base.extend<GateOptions & { cspViolations: string[]; schoolClock: undefined }>({
  pinSchoolClock: [true, { option: true }],
  schoolClock: [
    async ({ context, pinSchoolClock }, use) => {
      if (pinSchoolClock) {
        await context.clock.setFixedTime(todayAt("09:00"));
        await context.route(
          (url) => url.pathname in CLOCK_READS,
          (route) => {
            const json = CLOCK_READS[new URL(route.request().url()).pathname];
            const isApiRead = route.request().resourceType() === "fetch" && json !== undefined;

            return isApiRead ? route.fulfill({ json }) : route.fallback();
          },
        );
      }

      await use(undefined);
    },
    { auto: true },
  ],
  cspViolations: [
    async ({ context }, use) => {
      const violations: string[] = [];
      context.on("console", (message) => {
        if (message.text().includes("Content Security Policy")) violations.push(message.text());
      });

      await use(violations);

      expect(violations, "the served Content-Security-Policy blocked something").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

import { test as base, expect } from "@playwright/test";
import { todayAt } from "./events-fixtures";

export interface GateOptions {
  /**
   * Pins what every page of the shell reads: the gate's school day at 9:00 (a spec may still set
   * its own instant), Paris as the parent's zone, no school zone so no holiday, and no unread
   * notification. Those reads run on every page, so leaving them to the live API also spends the
   * seeded parent's rate limit; a spec that routes one of them itself wins over this default.
   */
  pinShell: boolean;
}

const SHELL_READS: Record<string, unknown> = {
  "/assistant/preferences": {
    locale: null,
    timeZone: null,
    country: null,
    extractionEnabled: true,
  },
  "/school-calendar": { zone: null, holidays: [], bankHolidays: [] },
  "/notifications/unread-count": { count: 0 },
};

export const test = base.extend<GateOptions & { cspViolations: string[]; pinnedShell: undefined }>({
  pinShell: [true, { option: true }],
  pinnedShell: [
    async ({ context, pinShell }, use) => {
      if (pinShell) {
        await context.clock.setFixedTime(todayAt("09:00"));
        await context.route(
          (url) => url.pathname in SHELL_READS,
          (route) => {
            const json = SHELL_READS[new URL(route.request().url()).pathname];
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

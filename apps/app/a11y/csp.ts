import { test as base, expect } from "@playwright/test";
import { todayAt } from "./events-fixtures";

export interface GateOptions {
  /** Pins every page's clock to the gate's school day at 9:00; a spec may still set its own instant. */
  pinSchoolClock: boolean;
}

export const test = base.extend<GateOptions & { cspViolations: string[]; schoolClock: undefined }>({
  pinSchoolClock: [true, { option: true }],
  schoolClock: [
    async ({ context, pinSchoolClock }, use) => {
      if (pinSchoolClock) await context.clock.setFixedTime(todayAt("09:00"));

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

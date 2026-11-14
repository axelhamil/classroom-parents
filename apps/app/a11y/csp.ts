import { test as base, expect } from "@playwright/test";

export const test = base.extend<{ cspViolations: string[] }>({
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

import { shiftDate } from "@packages/ddd-kit/days";
import { blockingViolations } from "@packages/test/a11y";
import type { Locator } from "@playwright/test";
import { expect, test } from "./csp";
import { LEA, parisTime, REVIEW_EVENT, SCHOOL_THURSDAY, serveFamily } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const SATURDAY = shiftDate(SCHOOL_THURSDAY, 2);

const HOME = [
  { id: "today", w: 8, h: 2, hidden: false },
  { id: "tonight", w: 4, h: 1, hidden: false },
  { id: "overdue", w: 4, h: 1, hidden: false },
  { id: "calendar", w: 12, h: 3, hidden: false },
];

function deadline(index: number, offset: number, title: string, extra: object = {}) {
  const date = shiftDate(SATURDAY, offset);

  return {
    ...REVIEW_EVENT,
    id: `9b8c7d6e-5f4a-4b3c-8d2e-1f0a9b8c7d6${index}`,
    title,
    category: "homework",
    status: "confirmed",
    reviewReasons: [],
    deadlineDate: date,
    deadlineAt: `${date}T07:00:00.000Z`,
    ...extra,
  };
}

const LATE = deadline(1, -1, "Fiche de lecture à rendre");
const SUNDAY = deadline(2, 1, "Exposé à finir");
const MONDAY = deadline(3, 2, "Piscine du lundi", { category: "swimming" });
const MONDAY_DONE = deadline(4, 2, "Dictée à revoir", { done: true });
const TUESDAY = deadline(5, 3, "Contrôle sur les fractions", { category: "assessment" });

const ALL = [LATE, SUNDAY, MONDAY, MONDAY_DONE, TUESDAY];

async function titlesIn(region: Locator): Promise<string[]> {
  const shown = await Promise.all(
    ALL.map(async ({ title }) =>
      (await region.getByText(title, { exact: true }).count()) > 0 ? title : null,
    ),
  );

  return shown.filter((title) => title !== null).sort();
}

test.describe("the home on a Saturday", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  for (const time of ["10:00", "19:00"])
    test(`looks at Monday, with Sunday's deadlines, and every surface agrees (${time})`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(parisTime(SATURDAY, time));
      await serveFamily(page, {
        children: [LEA],
        events: ALL,
        homeLayout: HOME,
      });
      await page.goto("/");

      const briefing = page.getByRole("region", { name: "Pour lundi 23 novembre", exact: true });
      await expect(briefing.getByText(MONDAY.title, { exact: true })).toBeVisible();
      const planned = await titlesIn(briefing);
      expect(planned).toEqual([MONDAY.title, MONDAY_DONE.title, SUNDAY.title].sort());
      await expect(briefing.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "1 sur 3");

      const tonight = page.getByRole("region", { name: "Pour ce soir", exact: true });
      await expect(tonight.getByText(MONDAY.title, { exact: true })).toBeVisible();
      expect(await titlesIn(tonight)).toEqual([MONDAY.title, SUNDAY.title].sort());

      const late = page.getByRole("region", { name: "En retard, 1 échéance", exact: true });
      await expect(late.getByText(LATE.title, { exact: true })).toBeVisible();
      expect(await titlesIn(late)).toEqual([LATE.title]);

      expect(await blockingViolations(page)).toEqual([]);
    });
});

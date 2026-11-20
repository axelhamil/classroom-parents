import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./csp";
import { inDays, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const FULL_DATE = /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) \d{1,2} \p{L}+$/u;
const MAX_TABS = 80;
const TITLES = ["Fiche de fractions", "Lire le chapitre 3", "Contrôle de géographie"];

/** Three deadlines on each of the next six days, alternating children: enough to scroll every view. */
const BUSY_WEEK = Array.from({ length: 18 }, (_, index) => {
  const day = inDays(1 + Math.floor(index / 3));

  return {
    ...REVIEW_EVENT,
    id: `5e6f7a8b-9c0d-4e1f-8a2b-${String(index).padStart(12, "0")}`,
    childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
    status: "confirmed",
    category: index % 3 === 2 ? "assessment" : "homework",
    title: `${TITLES[index % 3]} ${index + 1}`,
    deadlineDate: day,
    deadlineAt: `${day}T07:00:00.000Z`,
  };
});

function agendaOf(page: Page): Locator {
  return page.getByRole("region", { name: "Agenda" });
}

async function openWeek(page: Page, width: number): Promise<Locator> {
  await page.setViewportSize({ width, height: 800 });
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: BUSY_WEEK });
  await page.goto("/?view=week");
  const week = agendaOf(page).locator("[data-slot=calendar-week]");
  await expect(week.locator("[data-slot=calendar-entry-link]").first()).toBeVisible();

  return week;
}

/** Every deadline of the week is an item of the list of its own day. */
async function expectEntriesListedUnderTheirDay(week: Locator): Promise<void> {
  const misplaced = await week.evaluate(
    (element) =>
      [...element.querySelectorAll("[data-slot=calendar-entry]")].filter(
        (entry) =>
          entry.closest("li")?.closest("ul, ol")?.closest("[data-slot=calendar-day]") === null,
      ).length,
  );
  expect(misplaced).toBe(0);
}

/**
 * Tabs through the week, forward or back (back is where a header at the top hides what scrolls
 * in), and returns what a sticky header hides whole: the app bar, the strip of
 * days, the date of a column. A focused control partly under one is fine, one fully under is lost.
 */
async function tabThroughWeek(
  page: Page,
  week: Locator,
  key: "Tab" | "Shift+Tab",
): Promise<{ visited: number; hidden: string[] }> {
  const links = week.locator("[data-slot=calendar-entry-link]");
  await (key === "Tab" ? links.first() : links.last()).focus();
  const hidden: string[] = [];
  let visited = 0;

  for (let tab = 0; tab < MAX_TABS; tab += 1) {
    const covered = await page.evaluate(() => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return null;
      if (!focused.closest("[data-slot=calendar-week]")) return null;

      const box = focused.getBoundingClientRect();
      const stickies = [...document.querySelectorAll<HTMLElement>("body *")].filter(
        (element) => getComputedStyle(element).position === "sticky" && !element.contains(focused),
      );
      const under = stickies.some((sticky) => {
        const header = sticky.getBoundingClientRect();

        return (
          header.top <= box.top &&
          header.bottom >= box.bottom &&
          header.left <= box.left &&
          header.right >= box.right
        );
      });

      return under ? (focused.getAttribute("aria-label") ?? focused.textContent ?? "") : "";
    });
    if (covered === null) break;

    visited += 1;
    if (covered) hidden.push(covered);

    await page.keyboard.press(key);
  }

  return { visited, hidden };
}

test.describe("the week, read by a screen reader and a keyboard", () => {
  test.use({ storageState: STORAGE_STATE });

  test("opens as a planner of seven days named in full, today marked once (1440 px)", async ({
    page,
  }) => {
    const week = await openWeek(page, 1440);

    await expect(week).toHaveAttribute("data-arrangement", "board");
    await expect(week.getByRole("heading", { level: 3 })).toHaveCount(7);
    await expect(week.getByRole("heading", { level: 3, name: FULL_DATE })).toHaveCount(7);
    await expect(agendaOf(page).locator("[aria-current=date]")).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Week-end" })).toBeVisible();
    await expectEntriesListedUnderTheirDay(week);
  });

  test("opens as a planner from 768 px", async ({ page }) => {
    const week = await openWeek(page, 768);

    await expect(week).toHaveAttribute("data-arrangement", "board");
    await expect(week.getByRole("heading", { level: 3 })).toHaveCount(7);
  });

  test("reads as a thread under the strip of days on a phone (390 px)", async ({ page }) => {
    const week = await openWeek(page, 390);

    await expect(week).toHaveAttribute("data-arrangement", "fil");
    await expect(page.getByRole("radiogroup", { name: "Jours de la semaine" })).toBeVisible();
    await expect(week.locator("[aria-current=date]")).toHaveCount(
      await week.locator("[data-tone=today]").count(),
    );
    await expectEntriesListedUnderTheirDay(week);
    const scroll = await agendaOf(page).evaluate((agenda) => [
      agenda.scrollHeight,
      agenda.clientHeight,
    ]);
    expect(scroll[0]).toBe(scroll[1]);
  });

  for (const width of [390, 768, 1440])
    for (const key of ["Tab", "Shift+Tab"] as const)
      test(`keeps every focused deadline out from under a sticky header (${width} px, ${key})`, async ({
        page,
      }) => {
        const week = await openWeek(page, width);

        const { visited, hidden } = await tabThroughWeek(page, week, key);
        expect(visited).toBeGreaterThan(BUSY_WEEK.length / 2);
        expect(hidden).toEqual([]);
      });
});

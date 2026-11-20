import type { Locator, Page } from "@playwright/test";
import { wordlessCategories } from "./agenda-board";
import { expect, test } from "./csp";
import { inDays, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

test.use({ storageState: STORAGE_STATE });

const TITLES = [
  "Exercices 4 à 9 page 112 du manuel de mathématiques",
  "Lire le chapitre 3 et répondre aux questions",
  "Contrôle de géographie sur les fleuves de France",
  "Rapporter l'autorisation de sortie signée",
  "Apprendre la poésie pour la réciter en classe",
  "Fiche de fractions",
];
const CATEGORIES = [
  "homework",
  "document_due",
  "assessment",
  "school_trip",
  "swimming",
  "homework",
];
const COURSES = ["Mathématiques", "Français", "Histoire-Géographie", "Vie de classe"];

/** Six deadlines on the busiest day, tomorrow, two children, a course each: titles that wrap. */
const BUSIEST = inDays(1);
const PACKED_DAY = TITLES.map((title, index) => ({
  ...REVIEW_EVENT,
  id: `7a8b9c0d-1e2f-4a3b-8c4d-${String(index).padStart(12, "0")}`,
  childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
  status: "confirmed",
  category: CATEGORIES[index],
  title,
  course: {
    id: `course-${index % COURSES.length}`,
    name: COURSES[index % COURSES.length],
  },
  deadlineDate: BUSIEST,
  deadlineAt: `${BUSIEST}T07:00:00.000Z`,
}));

/** How many of a day's deadlines are drawn whole: inside every scrolling box above them and the window. */
function wholeCards(day: Locator): Promise<number> {
  return day.evaluate((element) => {
    const frames: DOMRect[] = [new DOMRect(0, 0, window.innerWidth, window.innerHeight)];
    for (let node = element.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden")
        frames.push(node.getBoundingClientRect());
    }

    return [...element.querySelectorAll("[data-slot=calendar-entry]")].filter((card) => {
      const box = card.getBoundingClientRect();

      return frames.every((frame) => box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1);
    }).length;
  });
}

/** Per card: how far the checkbox's centre sits from the centre of the title's first line. */
function checkboxOffsets(day: Locator): Promise<number[]> {
  return day.locator("[data-slot=calendar-entry]").evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.querySelector("[data-slot=checkbox]")?.getBoundingClientRect();
      const title = card.querySelector("[data-slot=calendar-entry-link]");
      const range = document.createRange();
      if (title) range.selectNodeContents(title);
      const line = range.getClientRects()[0];
      if (!box || !line) return Number.POSITIVE_INFINITY;

      return Math.abs(box.top + box.height / 2 - (line.top + line.height / 2));
    }),
  );
}

async function busiestDay(page: Page, homeLayout: unknown[]): Promise<Locator> {
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: PACKED_DAY, homeLayout });
  await page.goto("/");
  const day = page
    .getByRole("region", { name: "Agenda" })
    .locator(`[data-slot=calendar-day][data-jump="${BUSIEST}"]`)
    .first();
  await expect(day.locator("[data-slot=calendar-entry]").first()).toBeVisible();

  return day;
}

test.describe("the Agenda shows three deadlines of a day without a gesture", () => {
  for (const width of [768, 993, 1280, 1440])
    for (const size of ["l", "xl"])
      test(`in a tile ${size.toUpperCase()} at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const day = await busiestDay(page, [{ id: "calendar", size }]);

        await expect.poll(() => wholeCards(day)).toBeGreaterThanOrEqual(3);
        for (const offset of await checkboxOffsets(day)) expect(offset).toBeLessThanOrEqual(2);
        expect(await wordlessCategories(day)).toEqual([]);
      });

  test("in the phone's thread at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const day = await busiestDay(page, [{ id: "calendar", size: "xl" }]);
    await day.evaluate((element) => element.scrollIntoView({ block: "start" }));

    await expect.poll(() => wholeCards(day)).toBeGreaterThanOrEqual(3);
    for (const offset of await checkboxOffsets(day)) expect(offset).toBeLessThanOrEqual(2);
  });
});

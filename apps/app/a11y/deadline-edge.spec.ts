import { COLOR_SCHEMES } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import {
  inDays,
  LEA,
  MAXIMILIEN,
  parisTime,
  REVIEW_EVENT,
  serveFamily,
  todayAt,
} from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

function deadline(index: number, offset: number, time: string, title: string, category: string) {
  const date = inDays(offset);

  return {
    ...REVIEW_EVENT,
    id: `7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5${index}`,
    title,
    category,
    status: "confirmed",
    reviewReasons: [],
    deadlineDate: date,
    deadlineTime: time,
    deadlineAt: parisTime(date, time).toISOString(),
  };
}

// Today, tomorrow, late and later: every state a deadline card can be in, on the home and in the agenda.
const EVENTS = [
  deadline(1, 0, "18:00", "Rendre l'autorisation de sortie", "document_due"),
  deadline(2, 1, "08:30", "Exercices 4 à 9 page 112", "homework"),
  deadline(3, -1, "08:30", "Fiche de fractions", "homework"),
  deadline(4, 4, "08:30", "Piscine : maillot, bonnet, lunettes", "swimming"),
];

const FAMILIES = [
  { name: "one child, on paper with the child's edge", children: [LEA] },
  { name: "two children, on their tints", children: [LEA, MAXIMILIEN] },
];

interface CardEdges {
  cards: number;
  stripes: number;
  offenders: string[];
}

/**
 * Reads the edges of every deadline card: a contour is coloured when one of its sides is drawn in
 * anything but the theme's neutral `--border`; the child's stripe is an inset shadow pushed to the
 * leading side. Two signals on one edge read as a bug, so a card never carries both.
 */
function cardEdges(page: Page): Promise<CardEdges> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.borderColor = "var(--border)";
    document.body.append(probe);
    const neutral = getComputedStyle(probe).borderTopColor;
    probe.remove();

    const invisible = (color: string) =>
      /^transparent$|rgba\(0, 0, 0, 0\)|\/ 0\)$/.test(color.trim());
    const sides = ["Top", "Right", "Bottom", "Left"] as const;
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-slot=calendar-entry], [data-slot=planner-card], [data-slot=planner-sticker]",
      ),
    ].filter((card) => card.getClientRects().length > 0);

    const edges = cards.map((card) => {
      const style = getComputedStyle(card);
      const coloured = sides.filter((side) => {
        const width = Number.parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        );
        const color = style.getPropertyValue(`border-${side.toLowerCase()}-color`);

        return width > 0 && !invisible(color) && color !== neutral;
      });
      const stripe = [
        ...style.boxShadow.matchAll(/(-?[\d.]+)px -?[\d.]+px [\d.]+px [\d.]+px inset/g),
      ].some(([, offset]) => Number(offset) !== 0);
      const title = card.querySelector("[data-slot=calendar-entry-link], a")?.textContent ?? "";

      return { coloured, stripe, name: `${card.dataset.slot} "${title.slice(0, 40)}"` };
    });

    return {
      cards: edges.length,
      stripes: edges.filter((edge) => edge.stripe).length,
      offenders: edges
        .filter((edge) => edge.coloured.length > 0 && edge.stripe)
        .map(
          (edge) => `${edge.name}: a ${edge.coloured.join("/")} contour beside the child's edge`,
        ),
    };
  });
}

test.describe("a deadline card has one coloured edge", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const family of FAMILIES)
    for (const width of [390, 1440])
      for (const scheme of COLOR_SCHEMES)
        test(`${family.name}, at ${width} px in ${scheme}`, async ({ page }) => {
          await showColorScheme(page, scheme);
          await page.setViewportSize({ width, height: 1100 });
          await page.clock.setFixedTime(todayAt("09:00"));
          await serveFamily(page, { children: family.children, events: EVENTS });
          await page.goto("/");
          await expect(page.getByText("Exercices 4 à 9 page 112").first()).toBeVisible();

          const edges = await cardEdges(page);

          expect(edges.cards).toBeGreaterThan(0);
          if (family.children.length === 1) expect(edges.stripes).toBeGreaterThan(0);
          expect(edges.offenders).toEqual([]);
        });
});

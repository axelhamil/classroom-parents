import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTES, type Palette } from "../palette-store";
import { THEME_COLORS } from "../theme-colors";
import type { ResolvedTheme } from "../theme-store";

const css = readFileSync(
  resolve(__dirname, "../../../../ui/src/styles/globals.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

type Tokens = Map<string, string>;

interface Element {
  dark: boolean;
  palette: Palette | undefined;
  root: boolean;
  parentDark: boolean;
}

interface Declaration {
  value: string;
  specificity: number;
  order: number;
}

const MODES = ["light", "dark"] as const satisfies readonly ResolvedTheme[];
const CHILDREN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
const CATEGORIES = ["assessment", "homework", "school-trip", "swimming", "document-due"] as const;

const AGENDA_PAPERS = [
  "surface-container",
  "surface-container at 55% over card",
  "primary at 6% over card",
] as const;

const TEXT = 4.5;
const GRAPHIC = 3;

const topLevelRules = [...css.matchAll(/^([^\s@}/][^{]*)\{([^{}]*)\}/gm)].map((match, order) => ({
  selectors: (match[1] ?? "").split(",").map((selector) => selector.trim()),
  declarations: [...(match[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
    ([, name, value]) => [name ?? "", (value ?? "").trim()] as const,
  ),
  order,
}));

function compoundMatches(compound: string, element: Pick<Element, "dark" | "palette" | "root">) {
  const parts = compound.match(/:root|\.dark|\[data-palette(?:="[a-z]+")?\]/g) ?? [];
  if (parts.join("") !== compound) return false;

  return parts.every((part) => {
    if (part === ":root") return element.root;
    if (part === ".dark") return element.dark && element.root;
    if (part === "[data-palette]") return element.palette !== undefined;

    return part === `[data-palette="${element.palette}"]`;
  });
}

function selectorSpecificity(selector: string, element: Element): number | undefined {
  const [ancestor, subject, ...rest] = selector.split(/\s+/);
  if (rest.length > 0 || ancestor === undefined) return undefined;

  const target = subject ?? ancestor;
  if (!compoundMatches(target, element)) return undefined;

  const ancestorMatches =
    subject === undefined || (ancestor === ".dark" && element.parentDark && !element.root);
  if (!ancestorMatches) return undefined;

  return selector.match(/:root|\.dark|\[data-palette/g)?.length;
}

function declaredTokens(element: Element): Tokens {
  const winners = new Map<string, Declaration>();

  for (const rule of topLevelRules) {
    const specificities = rule.selectors
      .map((selector) => selectorSpecificity(selector, element))
      .filter((specificity) => specificity !== undefined);
    if (specificities.length === 0) continue;

    const specificity = Math.max(...specificities);
    for (const [name, value] of rule.declarations) {
      const current = winners.get(name);
      if (current && current.specificity > specificity) continue;

      winners.set(name, { value, specificity, order: rule.order });
    }
  }

  return new Map([...winners].map(([name, { value }]) => [name, value]));
}

function computedTokens(declared: Tokens, inherited: Tokens): Tokens {
  const computed = new Map(inherited);
  const substitute = (value: string, depth: number): string =>
    value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      if (depth > 10) throw new Error(`var() cycle through ${name}`);
      const own = declared.get(name);

      return own === undefined ? (inherited.get(name) ?? "") : substitute(own, depth + 1);
    });

  for (const [name, value] of declared) computed.set(name, substitute(value, 0));

  return computed;
}

function pageTokens(palette: Palette, mode: ResolvedTheme): Tokens {
  const dark = mode === "dark";
  const html = { dark, palette, root: true, parentDark: false };

  return computedTokens(declaredTokens(html), new Map());
}

function previewTokens(palette: Palette, pagePalette: Palette, mode: ResolvedTheme): Tokens {
  const dark = mode === "dark";
  const preview = { dark, palette, root: false, parentDark: dark };

  return computedTokens(declaredTokens(preview), pageTokens(pagePalette, mode));
}

function linearRgb(color: string): LinearRgb {
  const match = color.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (!match) throw new Error(`not a measurable oklch colour: ${color}`);

  const [lightness, chroma, hue] = match.slice(1).map(Number) as [number, number, number];
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (channel: number) => Math.min(1, Math.max(0, channel));

  return [
    clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

type LinearRgb = [number, number, number];

const encode = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;

const decode = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

function composite(top: LinearRgb, alpha: number, base: LinearRgb): LinearRgb {
  const blend = (index: 0 | 1 | 2) =>
    decode(alpha * encode(top[index]) + (1 - alpha) * encode(base[index]));

  return [blend(0), blend(1), blend(2)];
}

function luminance([red, green, blue]: LinearRgb) {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: LinearRgb, second: LinearRgb) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((x, y) => y - x) as [
    number,
    number,
  ];

  return (lighter + 0.05) / (darker + 0.05);
}

/** Resolves a token, or a layer written "<token> at <n>% over <token>" as the browser composites it. */
function tokenColor(tokens: Tokens) {
  const color = (name: string): LinearRgb => {
    const layered = name.match(/^(.+) at (\d+)% over (.+)$/);
    if (!layered) return linearRgb(tokens.get(`--${name}`) ?? "");

    const [, top = "", alpha = "", base = ""] = layered;
    return composite(color(top), Number(alpha) / 100, color(base));
  };

  return color;
}

type Oklab = [lightness: number, a: number, b: number];

function oklab([red, green, blue]: LinearRgb): Oklab {
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const chroma = ([, a, b]: Oklab) => Math.hypot(a, b);

function hueGap(first: Oklab, second: Oklab) {
  const hue = ([, a, b]: Oklab) => (Math.atan2(b, a) * 180) / Math.PI;
  const gap = Math.abs(hue(first) - hue(second)) % 360;

  return Math.min(gap, 360 - gap);
}

// A colour word (blue, green, plum) spans about 30° of hue: closer than that, two colours read as one family.
const SAME_HUE = 30;
// Under this OKLab chroma a colour reads as a tinted grey, so its hue names nothing.
const HUED = 0.03;
// Five just noticeable OKLab steps (0.02 each): two shades of one family this far apart are told apart at a glance.
const APART = 0.1;

/** Two colours are confused when they share a hue family and sit close in OKLab. */
function confusable(first: Oklab, second: Oklab) {
  const [lightness = 0, a = 0, b = 0] = first.map((value, index) => value - (second[index] ?? 0));
  const distance = Math.hypot(lightness, a, b);
  const hued = chroma(first) >= HUED && chroma(second) >= HUED;

  return { distance, confused: hued && hueGap(first, second) < SAME_HUE && distance < APART };
}

type RolePair = readonly [role: string, child: (child: number) => string];

function rolePairs(mode: ResolvedTheme): RolePair[] {
  const fills = mode === "dark" ? ["", "-mark"] : [""];

  return [
    ...fills.flatMap((suffix): RolePair[] => [
      ["primary", (child) => `child-${child}${suffix}`],
      ["warning", (child) => `child-${child}${suffix}`],
      ["destructive", (child) => `child-${child}${suffix}`],
    ]),
    ["secondary", (child) => `child-${child}-container`],
    // The home's hero block is tinted by the action: it must not read as one child's card.
    ["primary-container", (child) => `child-${child}-container`],
    // A crunched day of the month planner is tinted `bg-warning/30`.
    ["warning at 30% over card", (child) => `child-${child}-container`],
  ];
}

function hex(color: string) {
  return `#${linearRgb(color)
    .map((channel) => Math.round(255 * encode(channel)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

type Pair = readonly [foreground: string, background: string, floor: number];

function criticalPairs(mode: ResolvedTheme): Pair[] {
  const mark = (child: number) => (mode === "dark" ? `child-${child}-mark` : `child-${child}`);

  return [
    ["foreground", "background", TEXT],
    ["foreground", "card", TEXT],
    ["popover-foreground", "popover", TEXT],
    ["muted-foreground", "background", TEXT],
    ["muted-foreground", "card", TEXT],
    ["muted-foreground", "surface-container-high", TEXT],
    ["primary-foreground", "primary", TEXT],
    ["primary", "background", TEXT],
    ["primary", "card", TEXT],
    ["primary", "surface-container", TEXT],
    ["secondary-foreground", "secondary", TEXT],
    ["destructive", "card", TEXT],
    // A destructive alert's outline button: its text stays destructive on `bg-background`, `dark:bg-input/30` over the card.
    ["destructive", mode === "dark" ? "input at 30% over card" : "background", TEXT],
    // The home's "dates to review" line: an outline button on the page.
    ["foreground", mode === "dark" ? "input at 30% over background" : "background", TEXT],
    ["destructive-foreground", "destructive", TEXT],
    ["warning-foreground", "warning", TEXT],
    ["highlight-foreground", "highlight", TEXT],
    ["success-foreground", "success", TEXT],
    ["input", "background", GRAPHIC],
    ["input", "card", GRAPHIC],
    ["ring", "background", GRAPHIC],
    ["ring", "card", GRAPHIC],
    ...CHILDREN.flatMap((child): Pair[] => [
      ["child-foreground", `child-${child}`, TEXT],
      ["foreground", `child-${child}-container`, TEXT],
      // An agenda row is tinted by its child; its meta line and category word sit on that tint.
      ["muted-foreground", `child-${child}-container`, TEXT],
      ...CATEGORIES.map(
        (category): Pair => [`category-${category}`, `child-${child}-container`, TEXT],
      ),
      [mark(child), "background", GRAPHIC],
      [mark(child), "card", GRAPHIC],
      [mark(child), "primary-container", GRAPHIC],
    ]),
    // The agenda of a one child family: deadlines on neutral paper, the weekend on a lighter paper, today's column breathed with ink.
    ...AGENDA_PAPERS.flatMap((paper): Pair[] => [
      ["foreground", paper, TEXT],
      ["muted-foreground", paper, TEXT],
    ]),
    // The hero block and the active navigation item sit on the action-tinted surface.
    ...["foreground", "muted-foreground", "primary", "destructive"].map(
      (foreground): Pair => [foreground, "primary-container", TEXT],
    ),
    ...CATEGORIES.map((category): Pair => [`category-${category}`, "primary-container", TEXT]),
    ...CATEGORIES.flatMap((category): Pair[] => [
      [`category-${category}`, `category-${category}-tint`, TEXT],
      [`category-${category}`, "card", TEXT],
      [`category-${category}`, "surface-container", TEXT],
    ]),
  ];
}

function paletteTokenNames() {
  const names = topLevelRules
    .filter((rule) => rule.selectors.some((selector) => selector.includes("data-palette")))
    .flatMap((rule) => rule.declarations.map(([name]) => name));

  return [...new Set(names)];
}

// What a reader of the high contrast palette reads: its ink, muted ink and action hold AAA.
const AAA = 7;
const INK_PAIRS = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "surface-container-high"],
  ["primary-foreground", "primary"],
  ["primary", "background"],
] as const;

// Five just noticeable OKLab steps between two palettes, summed over the page and the action: under that, two light palettes read as one.
const DISTINCT = 0.1;

describe("the light palettes", () => {
  const signature = (palette: Palette) => {
    const color = tokenColor(pageTokens(palette, "light"));

    return { page: oklab(color("background")), action: oklab(color("primary")) };
  };
  const distance = (first: Oklab, second: Oklab) =>
    Math.hypot(...first.map((value, index) => value - (second[index] ?? 0)));

  it("each differ from every other by their page and their action", () => {
    const failures = PALETTES.flatMap((first, index) =>
      PALETTES.slice(index + 1).map((second) => {
        const [one, two] = [signature(first), signature(second)];

        return {
          pair: `${first} and ${second}`,
          gap: distance(one.page, two.page) + distance(one.action, two.action),
        };
      }),
    )
      .filter(({ gap }) => gap < DISTINCT)
      .map(({ pair, gap }) => `${pair}: ΔE ${gap.toFixed(3)} < ${DISTINCT}`);

    expect(failures).toEqual([]);
  });
});

describe("the high contrast palette", () => {
  for (const mode of MODES) {
    it(`holds AAA on its ink and action in ${mode}`, () => {
      const color = tokenColor(pageTokens("contrast", mode));
      const failures = INK_PAIRS.map(([foreground, background]) => ({
        pair: `${foreground} on ${background}`,
        ratio: contrast(color(foreground), color(background)),
      }))
        .filter(({ ratio }) => ratio < AAA)
        .map(({ pair, ratio }) => `${pair} ${ratio.toFixed(2)} < ${AAA}`);

      expect(failures).toEqual([]);
    });
  }
});

describe("palettes", () => {
  for (const palette of PALETTES) {
    for (const mode of MODES) {
      it(`${palette} in ${mode} holds every critical pair at AA`, () => {
        const color = tokenColor(pageTokens(palette, mode));
        const failures = criticalPairs(mode)
          .map(([foreground, background, floor]) => ({
            pair: `${foreground} on ${background}`,
            ratio: contrast(color(foreground), color(background)),
            floor,
          }))
          .filter(({ ratio, floor }) => ratio < floor)
          .map(({ pair, ratio, floor }) => `${pair} ${ratio.toFixed(2)} < ${floor}`);

        expect(failures).toEqual([]);
      });

      it(`${palette} in ${mode} keeps every child colour apart from the action, the urgent amber and the alerts`, () => {
        const color = tokenColor(pageTokens(palette, mode));
        const failures = rolePairs(mode).flatMap(([role, childToken]) =>
          CHILDREN.map((child) => ({
            pair: `${childToken(child)} like ${role}`,
            ...confusable(oklab(color(childToken(child))), oklab(color(role))),
          }))
            .filter(({ confused }) => confused)
            .map(({ pair, distance }) => `${pair}: ΔE ${distance.toFixed(3)} < ${APART}`),
        );

        expect(failures).toEqual([]);
      });

      it(`${palette} in ${mode} keeps the action apart from the urgent amber and the alerts`, () => {
        const color = tokenColor(pageTokens(palette, mode));
        const failures = ["warning", "destructive"]
          .map((role) => ({ role, ...confusable(oklab(color("primary")), oklab(color(role))) }))
          .filter(({ confused }) => confused)
          .map(
            ({ role, distance }) => `primary like ${role}: ΔE ${distance.toFixed(3)} < ${APART}`,
          );

        expect(failures).toEqual([]);
      });

      it(`${palette} in ${mode} keeps the 16 child colours apart from each other`, () => {
        const color = tokenColor(pageTokens(palette, mode));
        const mark = (child: number) =>
          oklab(color(mode === "dark" ? `child-${child}-mark` : `child-${child}`));
        const failures = CHILDREN.flatMap((first) =>
          CHILDREN.filter((second) => second > first)
            .filter((second) => confusable(mark(first), mark(second)).confused)
            .map((second) => `child ${first} like child ${second}`),
        );

        expect(failures).toEqual([]);
      });

      it(`${palette} in ${mode} paints the browser chrome with its page colour`, () => {
        const background = pageTokens(palette, mode).get("--background") ?? "";

        expect(hex(background)).toBe(THEME_COLORS[palette][mode]);
      });

      it(`${palette} in ${mode} previews exactly as it renders, whatever the page palette`, () => {
        const page = pageTokens(palette, mode);

        for (const pagePalette of PALETTES) {
          const preview = previewTokens(palette, pagePalette, mode);

          for (const name of paletteTokenNames()) {
            expect(`${name} ${preview.get(name)}`).toBe(`${name} ${page.get(name)}`);
          }
        }
      });
    }
  }
});

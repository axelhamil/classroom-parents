import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP = fileURLToPath(new URL("..", import.meta.url));
const UI = fileURLToPath(new URL("../../../../packages/ui/src/components/ui", import.meta.url));

const PAGE_MAX_WIDTH =
  /\bmax-w-(?:\[|\(|(?:3xs|2xs|xs|sm|md|lg|xl|[2-7]xl|prose|screen|reading|form|settings|ultrawide)\b)/;

const BOUNDED_PRIMITIVES: Record<string, string> = {
  "page-container.tsx": "declares the page widths left bounded: a lone form, the paper sheet",
  "landing.tsx": "the marketing site's hero copy",
  "empty.tsx": "a lone message under its icon",
  "dialog.tsx": "an overlay floats over the page",
  "alert-dialog.tsx": "an overlay floats over the page",
  "sheet.tsx": "an overlay floats over the page",
  "drawer.tsx": "an overlay floats over the page",
  "popover.tsx": "an overlay floats over the page",
  "tooltip.tsx": "an overlay floats over the page",
  "tour.tsx": "an overlay floats over the page",
};

function pageWidthCaps(source: string): string[] {
  return source
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => PAGE_MAX_WIDTH.test(line))
    .map(({ line, index }) => `${index + 1} ${line.trim()}`);
}

function componentFiles(root: string, dirs: readonly string[]): string[] {
  return dirs.flatMap((dir) =>
    readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx") && !file.includes("__tests__"))
      .map((file) => join(root, dir, file)),
  );
}

function capsIn(root: string, files: readonly string[]): string[] {
  return files.flatMap((file) =>
    pageWidthCaps(readFileSync(file, "utf8")).map((cap) => `${relative(root, file)}:${cap}`),
  );
}

describe("page width", () => {
  it("fails a page max width", () => {
    expect(pageWidthCaps('<main className="mx-auto max-w-5xl">')).toHaveLength(1);
    expect(pageWidthCaps('<SectionCard className="max-w-settings">')).toHaveLength(1);
  });

  it("lets a text block keep its reading measure", () => {
    expect(pageWidthCaps('<p className="max-w-measure text-body">')).toEqual([]);
  });

  it("is never picked in a page of the app", () => {
    expect(capsIn(APP, componentFiles(APP, ["features", "shared", "router"]))).toEqual([]);
  });

  it("is never picked in a primitive, outside overlays and the declared bounded widths", () => {
    const primitives = componentFiles(UI, ["."]).filter(
      (file) => !(relative(UI, file) in BOUNDED_PRIMITIVES),
    );

    expect(capsIn(UI, primitives)).toEqual([]);
  });
});

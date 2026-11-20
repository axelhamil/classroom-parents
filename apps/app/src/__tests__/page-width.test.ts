import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const SCANNED = ["features", "shared", "router"];

const PAGE_MAX_WIDTH =
  /\bmax-w-(?:\[|\(|(?:3xs|2xs|xs|sm|md|lg|xl|[2-7]xl|prose|screen|reading|form|settings|ultrawide)\b)/;

function componentFiles(): string[] {
  return SCANNED.flatMap((dir) =>
    readdirSync(join(SRC, dir), { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => join(SRC, dir, file)),
  );
}

function hardCodedPageWidths(): string[] {
  return componentFiles().flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => PAGE_MAX_WIDTH.test(line))
      .map(({ line, index }) => `${relative(SRC, file)}:${index + 1} ${line.trim()}`),
  );
}

describe("page width", () => {
  it("is declared through pageContainerVariants, never a max width picked in a page", () => {
    expect(hardCodedPageWidths()).toEqual([]);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const SCANNED = ["apps/app/src", "apps/site/src", "packages/ui/src", "packages/web-kit/src"];
// The only inline styles: values known at run time only, which no class can name. Anything else goes through a token.
const RUNTIME_STYLES = [
  {
    at: "apps/app/src/shared/virtual/virtual-list.tsx",
    style: "style={{ height }}",
    why: "the virtual list's total height is measured from its rows",
  },
  {
    at: "apps/app/src/shared/virtual/virtual-list.tsx",
    style: "style={{ transform: `translateY(",
    why: "each virtual row sits at the offset the virtualizer computes",
  },
  {
    at: "packages/ui/src/components/ui/progress.tsx",
    style: "style={{ transform: `translateX(-",
    why: "the bar fills to the progress value",
  },
  {
    at: "packages/ui/src/components/ui/toggle-group.tsx",
    style: 'style={{ "--gap": spacing } as React.CSSProperties}',
    why: "the gap is the spacing prop the caller passes",
  },
] as const;

interface Line {
  file: string;
  number: number;
  text: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(path);

    return /\.tsx?$/.test(entry.name) && !/\.(test|gen)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function isComment(text: string) {
  return /^\s*(\/\/|\/?\*)/.test(text);
}

const files = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => ({
  file: relative(ROOT, path),
  source: readFileSync(path, "utf8"),
}));

const lines: Line[] = files.flatMap(({ file, source }) => {
  return source
    .split("\n")
    .map((text, index) => ({ file, number: index + 1, text }))
    .filter((line) => !isComment(line.text));
});

const where = (line: Line) => `${line.file}:${line.number}  ${line.text.trim().slice(0, 120)}`;

function offenders(pattern: RegExp, scope: (line: Line) => boolean = () => true) {
  return lines.filter((line) => scope(line) && pattern.test(line.text)).map(where);
}

const inApps = (line: Line) => line.file.startsWith("apps/");
const MARK_FILES = /(brand-link|brand-mark|checkbox)\.tsx$/;

describe("visual system", () => {
  it("writes no arbitrary value for a look-defining utility", () => {
    expect(
      offenders(
        /(?<![\w-])(rounded|shadow|border|ring|outline|text|leading|tracking|size|stroke)(-[a-z]{1,2})?-\[(?!--)/,
      ),
    ).toEqual([]);
  });

  it("rounds only by role: mark, inner, popover, surface or full", () => {
    expect(
      offenders(
        /(?<![\w-])rounded(-[tblrsexy]{1,2})?(-(xs|sm|md|lg|xl|2xl|3xl|4xl)(?![\w-])|(?=["'`\s]))/,
      ),
    ).toEqual([]);
  });

  it("lifts only by role: rest, raised or float", () => {
    expect(offenders(/(?<![\w-])shadow-(2xs|xs|sm|md|lg|xl|2xl)(?![\w-])/)).toEqual([]);
  });

  it("draws every icon with the one stroke of the theme", () => {
    expect(
      offenders(/strokeWidth|stroke-width/, (line) => !MARK_FILES.test(line.file)).filter(
        (offender) => !offender.startsWith("packages/ui/src/styles"),
      ),
    ).toEqual([]);
  });

  it("sizes icons only with the three icon tokens", () => {
    expect(offenders(/svg\]:size-(?!icon(-mark|-sm|-lg)?(?![\w-]))/)).toEqual([]);
  });

  it("styles inline only what is known at run time", () => {
    const runtime = (line: Line) =>
      RUNTIME_STYLES.some(({ at, style }) => line.file === at && line.text.includes(style));

    expect(offenders(/style=\{\{/, (line) => !runtime(line))).toEqual([]);
  });

  it("lists no runtime style that is gone", () => {
    const stale = RUNTIME_STYLES.filter(
      ({ at, style }) => !lines.some((line) => line.file === at && line.text.includes(style)),
    ).map(({ at, why }) => `${at}: ${why}`);

    expect(stale).toEqual([]);
  });

  it("sizes an icon element only with the icon tokens", () => {
    expect(offenders(/<\w*Icon\b[^>]*(?<![\w-])(size|h|w)-[\d.]+/)).toEqual([]);
  });

  it("draws a round mark with the mark token, never an 8px size of its own", () => {
    expect(
      offenders(
        /(?<![\w-])size-2(?![\w.-])[^"]*rounded-full|rounded-full[^"]*(?<![\w-])size-2(?![\w.-])/,
      ),
    ).toEqual([]);
  });

  it("draws a border 1 or 2px wide, or the width of the stripe", () => {
    expect(offenders(/(?<![\w-])border(-[xytblrse])?-(\d{2,}|[3-9])(?![\w.])/)).toEqual([]);
  });

  it("sizes nothing with the removed touch token, which no longer compiles", () => {
    expect(offenders(/(?<![\w-])(min-|max-)?(h|w|size)-touch(?![\w-])/)).toEqual([]);
  });

  it("sizes controls only with the control tokens", () => {
    const controls = files.filter(({ file }) =>
      /packages\/ui\/src\/components\/ui\/(button|toggle|input|select|tabs)\.tsx$/.test(file),
    );
    const numeric = controls.flatMap(({ file, source }) => {
      const block = source.match(/\bsize: \{[\s\S]*?\n {6}\},/)?.[0] ?? "";

      return [...block.matchAll(/(?<![\w-])(h|size|min-h)-\d[\w.]*/g)].map(
        ([match]) => `${file}  ${match}`,
      );
    });

    expect(numeric).toEqual([]);
  });

  it("leaves the look of every app screen to the primitives", () => {
    const look =
      /^(rounded|shadow|border|ring|outline|font|leading|tracking)(-|$)|^text-(xs|sm|base|lg|\d?xl|meta|small|body|heading|title|display|\[)/;
    const offending = files
      .filter(({ file }) => file.startsWith("apps/"))
      .flatMap(({ file, source }) =>
        [...source.matchAll(/className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\}|\{`([^`]*)`\})/g)].flatMap(
          (match) =>
            `${match[1] ?? ""} ${match[2] ?? ""} ${match[3] ?? ""}`
              .split(/[\s"'`,]+/)
              .map((token) => token.split(":").at(-1) ?? "")
              .filter((utility) => look.test(utility))
              .map((utility) => `${file}  ${utility}`),
        ),
      );

    expect(offending).toEqual([]);
  });

  it("finds sources to scan", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(lines.some(inApps)).toBe(true);
  });
});

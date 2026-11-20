import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { frCatalog } from "@packages/i18n";
import { describe, expect, it } from "vitest";
import type { EventItem } from "../../api/queries/events";

const APP_SRC = join(import.meta.dirname, "../../..");

type Where = { shown: string } | { hidden: string };

/**
 * Every field the server sends about a deadline, with the file that shows it, or why it is not
 * shown. A new field fails the type check until it is placed here (13).
 */
const EVENT_FIELDS = {
  id: { hidden: "the link to the deadline, never read by a parent" },
  childId: { shown: "shared/format/child-hue.ts" },
  course: { shown: "features/events/components/event-when.tsx" },
  title: { shown: "features/events/components/calendar/calendar-event-row.tsx" },
  description: { shown: "features/events/components/event-detail-body.tsx" },
  category: { shown: "features/events/components/calendar/calendar-event-row.tsx" },
  deadlineDate: { shown: "shared/agenda/when.ts" },
  deadlineTime: { shown: "shared/agenda/when.ts" },
  deadlineAt: { hidden: "the order of the lists; the parent reads the date and the time" },
  status: { shown: "shared/agenda/deadline-facts.ts" },
  reviewReasons: { shown: "features/events/review-labels.ts" },
  amendReason: { shown: "features/events/review-labels.ts" },
  evidence: { shown: "features/events/components/review-reasons.tsx" },
  source: { shown: "features/events/components/event-when.tsx" },
  done: { shown: "features/events/components/calendar/calendar-event-row.tsx" },
  announcementUrl: { shown: "features/events/components/event-detail-body.tsx" },
  receivedAt: { shown: "features/events/components/event-when.tsx" },
  edited: { hidden: "superseded by editedFields, which says which field the parent changed" },
  editedFields: { shown: "features/events/forms/event-edit-form.tsx" },
  checklist: { shown: "features/events/hooks/use-checklist.ts" },
} as const satisfies Record<keyof EventItem, Where>;

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourcesUnder(path);

    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

type Catalog = { readonly [key: string]: string | Catalog };

function flatten(catalog: Catalog, prefix = ""): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    typeof value === "string" ? [[`${prefix}${key}`, value]] : flatten(value, `${prefix}${key}.`),
  );
}

const PLURAL = /_(zero|one|two|few|many|other)$/;

describe("what a deadline carries reaches the parent (13)", () => {
  it.each(
    Object.entries(EVENT_FIELDS).flatMap(([field, where]) =>
      "shown" in where ? [[field, where.shown]] : [],
    ),
  )("%s is read by %s", (field, file) => {
    const source = readFileSync(join(APP_SRC, file), "utf8");

    expect(source).toMatch(new RegExp(`\\b${field}\\b`));
  });
});

describe("a window named in copy reads its constant (15)", () => {
  const agendaCopy = [...flatten(frCatalog.home.blocks), ...flatten(frCatalog.events.briefing)];

  it.each(agendaCopy)("%s writes no day count of its own", (_key, text) => {
    expect(text).not.toMatch(/\b\d+\s+(\p{L}+\s+)?(jours?|semaines?)\b/u);
  });
});

describe("a plural key is always given its count (16)", () => {
  const sources = sourcesUnder(APP_SRC).map((path) => ({
    path: relative(APP_SRC, path),
    text: readFileSync(path, "utf8"),
  }));
  const pluralKeys = [
    ...new Set(
      Object.values(frCatalog)
        .flatMap((namespace) => flatten(namespace))
        .map(([key]) => key)
        .filter((key) => PLURAL.test(key))
        .map((key) => key.replace(PLURAL, "")),
    ),
  ];

  const givesCount = (args: string, text: string) => {
    if (/\bcount/.test(args)) return true;

    const values = /^\s*,\s*(\w+)\s*$/.exec(args)?.[1];
    const declared = values && new RegExp(`const ${values} = \\{[^}]*\\bcount\\b`).test(text);

    return Boolean(declared);
  };

  it.each(pluralKeys)("%s", (key) => {
    const call = new RegExp(
      `\\bt\\w*\\(\\s*"(?:\\w+:)?${key.replaceAll(".", "\\.")}"([^)]*)\\)`,
      "g",
    );
    const missing = sources.flatMap(({ path, text }) =>
      [...text.matchAll(call)]
        .filter(([, args]) => !givesCount(args ?? "", text))
        .map(([found]) => `${path}: ${found}`),
    );

    expect(missing).toEqual([]);
  });
});

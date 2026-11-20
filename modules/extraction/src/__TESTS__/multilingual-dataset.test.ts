import { describe, expect, it } from "bun:test";
import { ADVERSARIAL_CASES } from "../../eval/adversarial-dataset";
import { type CaseLanguage, MULTILINGUAL_CASES } from "../../eval/multilingual-dataset";

const MINIMUM_PER_LANGUAGE: [CaseLanguage, number][] = [
  ["ar", 15],
  ["pt", 15],
  ["en", 15],
  ["es", 15],
  ["mixed", 10],
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const regions = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isRegion(code: string): boolean {
  if (!/^[A-Z]{2}$/.test(code)) return false;

  try {
    return regions.of(code) !== undefined;
  } catch {
    return false;
  }
}

function localDay(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(instant));
}

function datesOf(item: (typeof MULTILINGUAL_CASES)[number]): string[] {
  return item.expected.flatMap((event) =>
    event.alsoAccepted === undefined
      ? [event.deadlineDate]
      : [event.deadlineDate, event.alsoAccepted],
  );
}

describe("multilingual dataset", () => {
  it("holds enough cases in every language", () => {
    const shortfalls = MINIMUM_PER_LANGUAGE.filter(
      ([language, minimum]) =>
        MULTILINGUAL_CASES.filter((item) => item.language === language).length < minimum,
    );

    expect(shortfalls).toEqual([]);
  });

  it("gives every case an id unique across the multilingual and adversarial sets", () => {
    const ids = [...MULTILINGUAL_CASES, ...ADVERSARIAL_CASES].map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes every expected date as a valid ISO day", () => {
    const invalid = MULTILINGUAL_CASES.filter((item) =>
      datesOf(item).some((date) => !isIsoDate(date)),
    );

    expect(invalid.map((item) => item.id)).toEqual([]);
  });

  it("expects no deadline before the publication day in the case's time zone", () => {
    const early = MULTILINGUAL_CASES.filter((item) => {
      const publishedOn = localDay(item.publishedAt, item.timeZone);

      return datesOf(item).some((date) => date < publishedOn);
    });

    expect(early.map((item) => item.id)).toEqual([]);
  });

  it("uses a time zone and a country the platform knows", () => {
    const unknown = MULTILINGUAL_CASES.filter(
      (item) =>
        Number.isNaN(new Date(item.publishedAt).getTime()) ||
        !isTimeZone(item.timeZone) ||
        (item.country !== null && !isRegion(item.country)),
    );

    expect(unknown.map((item) => item.id)).toEqual([]);
  });
});

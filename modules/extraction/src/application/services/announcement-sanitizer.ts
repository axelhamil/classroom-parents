import { FRENCH_MONTHS, FRENCH_WEEKDAYS, withoutMarks } from "./french-calendar";

const URL_PATTERN =
  /(?:\bhttps?:\/\/|\bwww\.|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/)[^\s<>"]*[^\s<>".,;:!?)]/giu;
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE_PATTERN = /(?<![\d+])(?:(?:\+|00)33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/gu;
const LONG_DIGIT_RUN_PATTERN = /\d{6,}/gu;
const NAME_BOUNDARY_BEFORE = "(?<![\\p{L}\\p{M}\\p{N}])";
const NAME_BOUNDARY_AFTER = "(?![\\p{L}\\p{M}\\p{N}])";
const NEVER_A_FIRST_NAME = new Set([
  ...[
    "le",
    "la",
    "les",
    "l",
    "un",
    "une",
    "de",
    "du",
    "des",
    "d",
    "au",
    "aux",
    "a",
    "et",
    "ou",
    "en",
  ],
  ...[
    "da",
    "dos",
    "van",
    "von",
    "der",
    "den",
    "el",
    "ben",
    "ma",
    "mon",
    "mes",
    "ta",
    "ton",
    "sa",
    "son",
  ],
  ...FRENCH_WEEKDAYS,
  ...FRENCH_MONTHS,
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function letterPattern(char: string, anyCase: boolean): string {
  if (!/\p{L}/u.test(char)) return escapeRegExp(char);

  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  const variants = anyCase && lower !== upper ? `[${lower}${upper}]` : escapeRegExp(char);

  return `${variants}\\p{M}*`;
}

function fullNamePattern(name: string): string {
  return Array.from(withoutMarks(name))
    .map((char) => letterPattern(char, true))
    .join("");
}

function properNounPattern(name: string): string {
  const chars = Array.from(withoutMarks(name).toLowerCase());

  return chars
    .map((char, index) => {
      const startsAWord = index === 0 || /[-']/.test(chars[index - 1] ?? "");

      return letterPattern(startsAWord ? char.toUpperCase() : char, false);
    })
    .join("");
}

function namePatternsOf(childName: string): string[] {
  const full = childName.trim().replace(/\s+/g, " ");
  const [firstName = ""] = full.split(" ");
  const firstNameIsSafe = !NEVER_A_FIRST_NAME.has(withoutMarks(firstName).toLowerCase());

  return [
    full.includes(" ") ? fullNamePattern(full) : "",
    firstNameIsSafe && firstName.length >= 2 ? properNounPattern(firstName) : "",
  ].filter((pattern) => pattern !== "");
}

interface Segment {
  raw: string;
  clean: string;
  redacted: boolean;
}

export type OffsetEdge = "start" | "end";

export interface SanitizedAnnouncement {
  text: string;
  rawOffset: (offset: number, edge: OffsetEdge) => number;
}

function splitOn(
  segment: Segment,
  pattern: RegExp,
  token: string,
  inDecomposed: boolean,
): Segment[] {
  if (segment.redacted) return [segment];

  const text = inDecomposed ? segment.raw.normalize("NFD") : segment.raw;
  const recompose = (piece: string) => (inDecomposed ? piece.normalize("NFC") : piece);
  const pieces: Segment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const kept = recompose(text.slice(cursor, match.index));
    const replaced = recompose(match[0]);

    pieces.push({ raw: kept, clean: kept, redacted: false });
    pieces.push({ raw: replaced, clean: token, redacted: true });
    cursor = match.index + match[0].length;
  }

  const rest = recompose(text.slice(cursor));
  pieces.push({ raw: rest, clean: rest, redacted: false });

  return pieces.filter((piece) => piece.raw !== "");
}

function childNamePattern(childNames: readonly string[]): RegExp | undefined {
  const patterns = childNames.flatMap(namePatternsOf);
  if (patterns.length === 0) return undefined;

  return new RegExp(`${NAME_BOUNDARY_BEFORE}(?:${patterns.join("|")})${NAME_BOUNDARY_AFTER}`, "gu");
}

function rawOffsetIn(segments: readonly Segment[], offset: number, edge: OffsetEdge): number {
  let clean = 0;
  let raw = 0;

  for (const segment of segments) {
    const cleanEnd = clean + segment.clean.length;
    const inside = edge === "start" ? offset < cleanEnd : offset <= cleanEnd;

    if (inside && !segment.redacted) return raw + offset - clean;
    if (inside) return edge === "start" || offset === clean ? raw : raw + segment.raw.length;

    clean = cleanEnd;
    raw += segment.raw.length;
  }

  return raw;
}

export function sanitizeWithOffsets(
  text: string,
  childNames: readonly string[] = [],
): SanitizedAnnouncement {
  const names = childNamePattern(childNames);
  const steps: [RegExp, string, boolean][] = [
    [URL_PATTERN, "[LIEN]", false],
    [EMAIL_PATTERN, "[EMAIL]", false],
    [PHONE_PATTERN, "[TELEPHONE]", false],
    [LONG_DIGIT_RUN_PATTERN, "[NUMERO]", false],
    ...(names ? [[names, "[ENFANT]", true] satisfies [RegExp, string, boolean]] : []),
  ];

  const segments = steps.reduce<Segment[]>(
    (current, [pattern, token, inDecomposed]) =>
      current.flatMap((segment) => splitOn(segment, pattern, token, inDecomposed)),
    [{ raw: text.normalize("NFC"), clean: text.normalize("NFC"), redacted: false }],
  );

  return {
    text: segments.map((segment) => segment.clean).join(""),
    rawOffset: (offset, edge) => rawOffsetIn(segments, offset, edge),
  };
}

export function sanitizeAnnouncement(text: string, childNames: readonly string[] = []): string {
  return sanitizeWithOffsets(text, childNames).text;
}

const STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "ce",
  "ces",
  "cette",
  "d",
  "dans",
  "de",
  "des",
  "du",
  "en",
  "et",
  "l",
  "la",
  "le",
  "les",
  "ou",
  "par",
  "pour",
  "sa",
  "ses",
  "son",
  "sur",
  "un",
  "une",
]);

const SAME_WORK_MIN_OVERLAP = 0.6;
const REFERENCE_MIN_COVERAGE = 0.75;
const REFERENCE_MIN_SHARED_WORDS = 2;

function singular(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

function wordsOf(text: string): Set<string> {
  const words = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "" && !STOP_WORDS.has(word))
    .map(singular);

  return new Set(words);
}

function sharedCount(left: Set<string>, right: Set<string>): number {
  return [...left].filter((word) => right.has(word)).length;
}

export function sameWork(title: string, other: string): boolean {
  const left = wordsOf(title);
  const right = wordsOf(other);
  const shared = sharedCount(left, right);
  const union = left.size + right.size - shared;

  return shared > 0 && shared / union >= SAME_WORK_MIN_OVERLAP;
}

export function namesWork(reference: string, title: string): boolean {
  const named = wordsOf(reference);
  const shared = sharedCount(named, wordsOf(title));

  return (
    named.size > 0 &&
    shared >= Math.min(REFERENCE_MIN_SHARED_WORDS, named.size) &&
    shared / named.size >= REFERENCE_MIN_COVERAGE
  );
}

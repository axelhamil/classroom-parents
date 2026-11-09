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
  ...["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"],
  ...["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout"],
  ...["septembre", "octobre", "novembre", "decembre"],
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
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

function withoutChildName(text: string, childName: string): string {
  const patterns = namePatternsOf(childName);
  if (patterns.length === 0) return text;

  const pattern = new RegExp(
    `${NAME_BOUNDARY_BEFORE}(?:${patterns.join("|")})${NAME_BOUNDARY_AFTER}`,
    "gu",
  );

  return text.normalize("NFD").replace(pattern, "[ENFANT]").normalize("NFC");
}

export function sanitizeAnnouncement(text: string, childName?: string): string {
  const withoutContacts = text
    .replace(URL_PATTERN, "[LIEN]")
    .replace(EMAIL_PATTERN, "[EMAIL]")
    .replace(PHONE_PATTERN, "[TELEPHONE]")
    .replace(LONG_DIGIT_RUN_PATTERN, "[NUMERO]");

  return childName ? withoutChildName(withoutContacts, childName) : withoutContacts;
}

const URL_PATTERN =
  /(?:\bhttps?:\/\/|\bwww\.|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/)[^\s<>"]*[^\s<>".,;:!?)]/giu;
const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const PHONE_PATTERN = /(?<![\d+])(?:(?:\+|00)33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/gu;
const LONG_DIGIT_RUN_PATTERN = /\d{6,}/gu;
const NAME_PART_MIN_LENGTH = 2;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function accentInsensitive(name: string): string {
  return Array.from(name.normalize("NFD").replace(/\p{M}/gu, ""))
    .map((char) => (/\p{L}/u.test(char) ? `${escapeRegExp(char)}\\p{M}*` : escapeRegExp(char)))
    .join("");
}

function namesOf(childName: string): string[] {
  const full = childName.trim().replace(/\s+/g, " ");
  const words = full.split(" ");
  const parts = full.split(/[\s-]+/);

  return [...new Set([full, ...words, ...parts])]
    .filter((name) => name.length >= NAME_PART_MIN_LENGTH)
    .sort((left, right) => right.length - left.length);
}

function withoutChildName(text: string, childName: string): string {
  const names = namesOf(childName);
  if (names.length === 0) return text;

  const pattern = new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])(?:${names.map(accentInsensitive).join("|")})(?![\\p{L}\\p{M}\\p{N}])`,
    "giu",
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

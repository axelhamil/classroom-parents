export function truncateOnWord(text: string, max: number): string {
  const chars = Array.from(text.trim().replace(/\s+/g, " "));
  if (chars.length <= max) return chars.join("");

  const cut = chars.slice(0, max + 1).join("");
  const lastSpace = cut.lastIndexOf(" ");

  return (lastSpace > 0 ? cut.slice(0, lastSpace) : chars.slice(0, max).join("")).trim();
}

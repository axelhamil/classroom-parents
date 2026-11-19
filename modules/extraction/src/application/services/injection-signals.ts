import type { Span } from "./extraction-checks";
import { withoutMarks } from "./french-calendar";

const CONFUSABLES: Record<string, string> = {
  а: "a",
  в: "b",
  е: "e",
  ё: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  у: "y",
  х: "x",
  і: "i",
  ї: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  ӏ: "l",
  α: "a",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
};

const INSTRUCTION_WORDS = `(?:${[
  ...["instructions?", "consignes?", "regles", "rules", "prompts?", "instrucciones", "reglas"],
  ...["instrucoes", "regras", "ta3limat", "t3limat", "ta3limet"],
].join("|")})`;

const INJECTION_MARKERS = [
  String.raw`\b(?:ignor|oubli|forget|disregard|olvid|esquec|ensa|nsa|insa|tjahel|tjahal)\w*\b.{0,40}\b${INSTRUCTION_WORDS}`,
  String.raw`\b(?:nouvelles?|new|nuevas?|novas?)\s+${INSTRUCTION_WORDS}`,
  String.raw`\b(?:system|systeme|sistema)\s+(?:prompt|override)|\bprompt\s+(?:systeme|system|del sistema|do sistema)`,
  String.raw`\b(?:developer|developpeur|desarrollador|desenvolvedor)\s+mode|\bmode\s+(?:developpeur|developer)`,
  String.raw`\b(?:you are now|tu es (?:maintenant|desormais)|ahora eres|agora voce e)\b`,
  String.raw`\bnote (?:to|for) the (?:assistant|ai|model)\b|\bnote (?:a|pour) l'(?:assistant|ia)\b`,
  String.raw`\b(?:recopie|copie|ecris|mets|insere|copy|write|put|include|copia|escribe|pon|escreva|coloque)\w*\b.{0,60}\b(?:la description|le titre|the description|the title|la descripcion|el titulo|a descricao|o titulo|json)\b`,
  String.raw`<\s*/?\s*(?:system|assistant|context|instructions?|data-[\w-]*)\s*>`,
  String.raw`"(?:events|amends)"\s*:`,
  String.raw`\[code\]`,
];

const ARABIC_MARKERS = ["تجاهل", "انس التعليمات", "التعليمات السابقة", "تعليمات جديدة"];

const INJECTION = new RegExp(INJECTION_MARKERS.join("|"), "giu");

const SENTENCE_END = /[.!?…]+(?=\s)|\n/g;

/** The text the heuristic reads: folded case and accents, homoglyphs mapped to Latin (UTS #39 idea). */
function skeleton(text: string): string {
  return Array.from(text, (char) => {
    const lower = char.toLowerCase();
    const latin = CONFUSABLES[lower] ?? lower;
    const bare = withoutMarks(latin);
    if (bare.length === char.length) return bare;

    return latin.length === char.length ? latin : char;
  }).join("");
}

function markerPositions(reading: string): number[] {
  const latin = Array.from(reading.matchAll(INJECTION), (match) => match.index);
  const arabic = ARABIC_MARKERS.flatMap((marker) => {
    const at = reading.indexOf(marker);
    return at === -1 ? [] : [at];
  });

  return [...latin, ...arabic];
}

function sentenceAround(text: string, at: number): Span {
  const ends = Array.from(text.matchAll(SENTENCE_END), (match) => match.index + match[0].length);
  const start = ends.findLast((end) => end <= at) ?? 0;
  const end = ends.find((end) => end > at) ?? text.length;

  return { start, end };
}

/**
 * The sentences of an announcement that try to instruct the model, in any school language,
 * spelled with homoglyphs or in Arabizi: "ignore the instructions", a system prompt, a forged
 * tag or answer, an order about the output fields, an encoded blob. Positions are those of the
 * text read (one skeleton character per character of the text).
 */
export function suspectedInjections(text: string): Span[] {
  const reading = skeleton(text);

  return markerPositions(reading).map((at) => sentenceAround(text, at));
}

export function overlapsAny(span: Span, suspects: readonly Span[]): boolean {
  return suspects.some((suspect) => span.start < suspect.end && suspect.start < span.end);
}

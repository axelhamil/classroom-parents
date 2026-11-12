const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function firstGrapheme(word: string): string {
  const [first] = graphemes.segment(word);

  return first?.segment ?? "";
}

export function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const edges = words.length > 1 ? [words[0], words[words.length - 1]] : words;

  return edges
    .map((word) => (word ? firstGrapheme(word) : ""))
    .join("")
    .toLocaleUpperCase("fr-FR");
}

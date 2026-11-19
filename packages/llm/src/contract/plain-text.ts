const MARKDOWN_LINK = /!?\[([^\]\n]*)\]\([^)\n]*\)/g;
const URL_LIKE = /\b(?:https?:\/\/|www\.|javascript:|data:)[^\s<>"'()]*/gi;
const SPACE_RUNS = /[^\S\n]{2,}/g;

/**
 * Removes every link a model could have written in a text a parent will read: a Markdown
 * link keeps its label, a bare address disappears. Generated text is rendered as plain text
 * nodes only, and the links a screen shows are built by our code from validated ids, so an
 * address in model output is never something we want to keep.
 */
export function withoutLinks(text: string): string {
  return text.replace(MARKDOWN_LINK, "$1").replace(URL_LIKE, "").replace(SPACE_RUNS, " ").trim();
}

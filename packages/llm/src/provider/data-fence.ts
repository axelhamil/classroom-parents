import { randomBytes } from "node:crypto";

const FENCE_LIKE_TAG = /<\s*\/?\s*(?:data-|context\b)[^>]*>/gi;

/** 128 random bits, hex encoded: the suffix of one request's data tag. */
export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/** Removes every tag shaped like our fences, so content can neither close nor reopen one. */
export function withoutFenceTags(text: string): string {
  return text.replace(FENCE_LIKE_TAG, "");
}

/** The tags that open and close the data block of the request carrying `nonce`. */
export function dataTags(nonce: string): { open: string; close: string } {
  return { open: `<data-${nonce}>`, close: `</data-${nonce}>` };
}

/** The facts our code computed, plus the name of this request's data tag. */
export function contextBlock(lines: readonly string[], nonce: string): string {
  return [
    "<context>",
    ...lines.map(withoutFenceTags),
    `data_tag: data-${nonce}`,
    "</context>",
  ].join("\n");
}

/** Third-party text fenced between this request's data tags. */
export function fencedText(text: string, nonce: string): string {
  const { open, close } = dataTags(nonce);

  return [open, withoutFenceTags(text), close].join("\n");
}

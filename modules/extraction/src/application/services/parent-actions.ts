import { truncateOnWord } from "@packages/ddd-kit";
import {
  type ActionCurrency,
  type ItemToBring,
  PARENT_ACTION_LABEL_MAX,
  PARENT_ACTIONS_MAX,
  type ParentAction,
} from "@packages/events/agenda-contract";
import { withoutLinks } from "@packages/llm/contract/plain-text";
import { withWesternDigits } from "./calendar-words";
import { locateQuote, type Span } from "./extraction-checks";
import type { ItemToBringCandidate, ParentActionCandidate } from "./extraction-output.schema";

export interface QuotedSource {
  text: string;
  isTrusted: (span: Span) => boolean;
}

const NUMBER = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`;
const CURRENCY = "(€|eur(?:os?)?|mad|dhs?|dirhams?|درهم|دراهم|د\\.م\\.?)";
const AMOUNT_AFTER = new RegExp(String.raw`${NUMBER}\s?${CURRENCY}(?![\p{L}])`, "iu");
const AMOUNT_BEFORE = new RegExp(String.raw`(€)\s?${NUMBER}`, "u");

interface WrittenAmount {
  amountCents: number | null;
  currency: ActionCurrency | null;
}

const NO_AMOUNT: WrittenAmount = { amountCents: null, currency: null };

function currencyOf(symbol: string): ActionCurrency {
  return /^(€|eur)/i.test(symbol) ? "EUR" : "MAD";
}

function amountIn(quote: string): WrittenAmount {
  const written = withWesternDigits(quote);
  const after = AMOUNT_AFTER.exec(written);
  const before = AMOUNT_BEFORE.exec(written);
  const [number, symbol] = after ? [after[1], after[2]] : [before?.[2], before?.[1]];
  if (number === undefined || symbol === undefined) return NO_AMOUNT;

  return {
    amountCents: Math.round(Number(number.replace(",", ".")) * 100),
    currency: currencyOf(symbol),
  };
}

function passageOf(quote: string, source: QuotedSource): string | undefined {
  const span = locateQuote(quote, source.text);
  if (span.isNone() || !source.isTrusted(span.unwrap())) return undefined;

  const { start, end } = span.unwrap();
  return source.text.slice(start, end);
}

function cleanLabel(label: string): string {
  return truncateOnWord(withoutLinks(label), PARENT_ACTION_LABEL_MAX);
}

/**
 * Keeps the parent actions whose quote is found in the announcement, outside any passage
 * suspected of giving instructions; the amount comes from that passage, never from the model.
 */
export function parentActionsFrom(
  candidates: readonly ParentActionCandidate[],
  source: QuotedSource,
): ParentAction[] {
  return candidates
    .flatMap((candidate): ParentAction[] => {
      const quote = passageOf(candidate.quote, source);
      const label = cleanLabel(candidate.label);
      if (quote === undefined || label === "") return [];

      return [{ kind: candidate.kind, label, ...amountIn(quote), quote }];
    })
    .slice(0, PARENT_ACTIONS_MAX);
}

/** Keeps the objects to bring whose quote is found in the announcement, one entry per object. */
export function itemsToBringFrom(
  candidates: readonly ItemToBringCandidate[],
  source: QuotedSource,
): ItemToBring[] {
  const kept = new Map<string, ItemToBring>();
  for (const candidate of candidates) {
    const quote = passageOf(candidate.quote, source);
    const item = cleanLabel(candidate.item);
    if (quote !== undefined && item !== "" && !kept.has(item.toLowerCase()))
      kept.set(item.toLowerCase(), { item, quote });
  }

  return [...kept.values()].slice(0, PARENT_ACTIONS_MAX);
}

import { Option, Result, truncateOnWord } from "@packages/ddd-kit";
import type { EvidencePassage, ReviewReason } from "@packages/events/agenda-contract";
import { withoutLinks } from "@packages/llm/contract/plain-text";
import {
  EXTRACTED_DESCRIPTION_MAX,
  EXTRACTED_TITLE_MAX,
  type ExtractedAmendment,
  type ExtractedEvent,
  type ExtractionConfidence,
  type ExtractionResult,
} from "../../domain/extracted-event";
import { ExtractionCategory } from "../../domain/value-objects/extraction-category.vo";
import type { SanitizedAnnouncement } from "./announcement-sanitizer";
import {
  locateQuote,
  reviewReasonsFor,
  type Span,
  sentenceAfter,
  sentenceBefore,
} from "./extraction-checks";
import type { ExtractionError } from "./extraction-error";
import type {
  AmendmentCandidate,
  ExtractedCandidate,
  ExtractionOutput,
} from "./extraction-output.schema";
import { overlapsAny, suspectedInjections } from "./injection-signals";
import { itemsToBringFrom, parentActionsFrom, type QuotedSource } from "./parent-actions";

interface Reading {
  source: SanitizedAnnouncement;
  publishedOn: string;
  suspects: Span[];
  suspected: boolean;
}

const TIME_PATTERN = /^(\d{1,2})\s*[:h]\s*(\d{2})(?::\d{2})?$/;

function truncate(text: string, max: number): string {
  return Array.from(text.trim()).slice(0, max).join("").trim();
}

function normalizedTime(raw: string | null): Result<Option<string>, "TIME_UNREADABLE"> {
  if (raw === null || raw.trim() === "") return Result.ok(Option.none());

  const match = TIME_PATTERN.exec(raw.trim());
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  if (!match || hours > 23 || minutes > 59) return Result.fail("TIME_UNREADABLE");

  return Result.ok(Option.some(`${String(hours).padStart(2, "0")}:${match[2]}`));
}

function toAmendment(candidate: AmendmentCandidate): ExtractedAmendment[] {
  const reference = truncateOnWord(candidate.reference, EXTRACTED_TITLE_MAX);
  if (reference === "") return [];

  const amendment: ExtractedAmendment = { kind: candidate.kind, reference };
  return [
    candidate.referenceDate === null
      ? amendment
      : { ...amendment, referenceDate: candidate.referenceDate },
  ];
}

function cappedConfidence(
  confidence: ExtractionConfidence,
  holidayRelative: boolean,
): ExtractionConfidence {
  return holidayRelative && confidence === "high" ? "medium" : confidence;
}

function fieldReasons(title: string, timeUnreadable: boolean, suspected: boolean): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (title === "") reasons.push("title_missing");
  if (timeUnreadable) reasons.push("time_unreadable");
  if (suspected) reasons.push("injection_suspected");

  return reasons;
}

function readFromSuspect(candidate: ExtractedCandidate, reading: Reading): boolean {
  const anchors = [candidate.evidenceQuote, candidate.dateExpression].map((quote) =>
    locateQuote(quote, reading.source.text).toUndefined(),
  );

  return anchors.some((span) => span !== undefined && overlapsAny(span, reading.suspects));
}

function contextOutsideSuspects(text: string, at: Span, reading: Reading): string {
  return overlapsAny(at, reading.suspects) ? "" : text;
}

function evidenceOf(quote: string, reading: Reading): Option<EvidencePassage> {
  const { source } = reading;

  return locateQuote(quote, source.text).map(({ start, end }) => {
    const before = sentenceBefore(source.text, start);
    const after = sentenceAfter(source.text, end);

    return {
      quote: source.text.slice(start, end),
      start: source.rawOffset(start, "start"),
      end: source.rawOffset(end, "end"),
      before: contextOutsideSuspects(before, { start: start - before.length, end: start }, reading),
      after: contextOutsideSuspects(after, { start: end, end: end + after.length }, reading),
    };
  });
}

function trustedQuotes(reading: Reading): QuotedSource {
  return {
    text: reading.source.text,
    isTrusted: (span) => !overlapsAny(span, reading.suspects),
  };
}

function writtenFields(
  candidate: ExtractedCandidate,
  category: ExtractionCategory,
  reading: Reading,
) {
  const title = truncateOnWord(withoutLinks(candidate.title), EXTRACTED_TITLE_MAX);
  if (reading.suspected) return { modelTitle: title, title: category.label(), description: "" };

  return {
    modelTitle: title,
    title: title || category.label(),
    description: truncate(withoutLinks(candidate.description), EXTRACTED_DESCRIPTION_MAX),
  };
}

function toEvent(
  candidate: ExtractedCandidate,
  reading: Reading,
): Result<ExtractedEvent, ExtractionError> {
  const category = ExtractionCategory.create(candidate.category);
  if (category.isFailure)
    return Result.fail({
      code: "EXTRACTION_OUTPUT_INVALID",
      message: "Le modèle a renvoyé une catégorie inconnue.",
    });

  const { modelTitle, title, description } = writtenFields(candidate, category.getValue(), reading);
  const time = normalizedTime(candidate.deadlineTime);
  const reviewReasons = [
    ...reviewReasonsFor(candidate, {
      source: reading.source.text,
      publishedOn: reading.publishedOn,
    }),
    ...fieldReasons(modelTitle, time.isFailure, reading.suspected),
  ];
  const deadlineTime = time.unwrapOr(Option.none());
  const evidence = evidenceOf(candidate.evidenceQuote, reading);

  return Result.ok({
    title,
    description,
    category: category.getValue().value,
    deadlineDate: candidate.deadlineDate,
    ...(deadlineTime.isSome() ? { deadlineTime: deadlineTime.unwrap() } : {}),
    confidence: cappedConfidence(candidate.confidence, reviewReasons.includes("relative_holiday")),
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    ...(evidence.isSome() ? { evidence: evidence.unwrap() } : {}),
    parentActions: parentActionsFrom(candidate.parentActions, trustedQuotes(reading)),
    toBring: itemsToBringFrom(candidate.toBring, trustedQuotes(reading)),
  });
}

/**
 * Turns a model answer into what the agenda may store: every date and quote checked against
 * the announcement, every event read from a sentence suspected of instructing the model
 * dropped, and the rest sent to review under its category label when the announcement looks
 * like an injection, to the heuristic or to the model itself.
 */
export function readOutput(
  output: ExtractionOutput,
  source: SanitizedAnnouncement,
  publishedOn: string,
): Result<ExtractionResult, ExtractionError> {
  const suspects = suspectedInjections(source.text);
  const reading: Reading = {
    source,
    publishedOn,
    suspects,
    suspected: output.injectionSuspected || suspects.length > 0,
  };

  const events: ExtractedEvent[] = [];
  for (const candidate of output.events.filter((event) => !readFromSuspect(event, reading))) {
    const event = toEvent(candidate, reading);
    if (event.isFailure) return Result.fail(event.getError());

    events.push(event.getValue());
  }

  return Result.ok({ events, amendments: output.amends.flatMap(toAmendment) });
}

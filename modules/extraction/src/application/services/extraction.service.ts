import {
  type IInstrumentation,
  Option,
  PARIS_TIME_ZONE,
  Result,
  truncateOnWord,
  utcToZonedWall,
} from "@packages/ddd-kit";
import type { EvidencePassage, ReviewReason } from "@packages/events/agenda-contract";
import type { ILanguageModel, ModelTier } from "@packages/llm/contract/language-model.port";
import { withoutLinks } from "@packages/llm/contract/plain-text";
import { UNTRUSTED_DATA_POLICY } from "@packages/llm/contract/untrusted-data";
import {
  EXTRACTED_DESCRIPTION_MAX,
  EXTRACTED_TITLE_MAX,
  type ExtractedAmendment,
  type ExtractedEvent,
  type ExtractionConfidence,
  type ExtractionResult,
} from "../../domain/extracted-event";
import { ExtractionCategory } from "../../domain/value-objects/extraction-category.vo";
import { type SanitizedAnnouncement, sanitizeWithOffsets } from "./announcement-sanitizer";
import {
  frenchWeekdayOf,
  locateQuote,
  reviewReasonsFor,
  sentenceAfter,
  sentenceBefore,
} from "./extraction-checks";
import { type ExtractionError, extractionErrorOf } from "./extraction-error";
import {
  type AmendmentCandidate,
  type ExtractedCandidate,
  extractionOutputSchema,
} from "./extraction-output.schema";

export interface ExtractInput {
  userId: string;
  text: string;
  publishedAt: Date;
  childNames?: readonly string[];
}

export const EXTRACTION_PROMPT_VERSION = "extraction-2";

const MAX_OUTPUT_TOKENS = 2_000;

export const EXTRACTION_SYSTEM_PROMPT = `You extract school deadlines from one Google Classroom announcement written in French by a teacher, for the parents of a pupil.
Return only the JSON the schema requests. Every text you write is in French.

Scope. Emit one event per distinct action with a date that the parent or the pupil must handle:
- assessment: test, exam, "contrôle", "évaluation", "DS", "interro".
- homework: homework to hand in or to prepare.
- school_trip: school trip or outing.
- swimming: swimming session, its gear or its authorisation.
- document_due: form, authorisation, payment slip or any document to fill, sign or return.
Skip purely informative posts, praise, reminders without a date and schedule changes without an action. If nothing qualifies, return {"events": [], "amends": []}.
Split an announcement holding several dated actions: the outing day and the authorisation return date are two events.

Fields.
- title: a short French noun phrase, never a person's name.
- description: at most 300 characters, one or two sentences on what to do or prepare, never a person's name.
- deadlineDate: YYYY-MM-DD, the calendar day in the time zone of the context.
- deadlineTime: HH:mm on 24 hours, only when the time is written ("8h30", "14 h"), otherwise null. Never guess a time.
- dateExpression: the words of the announcement that fix the date, copied verbatim.
- evidenceQuote: the sentence of the announcement supporting the event, copied verbatim.

Dates. Resolve every date from the publication date of the context, never from today.
- A day and a month without a year: the nearest such date on or after the publication date.
- A bare weekday ("pour jeudi"): its next occurrence after the publication day. "jeudi prochain": the first Thursday strictly after the publication day.
- A weekday and a date that disagree: keep the date as written.
- A date relative to school holidays ("avant les vacances", "à la rentrée"): you do not know the holiday calendar, give your best estimate with confidence medium at most.

Confidence. high: explicit date and clear category. medium: relative date resolved by a clear rule, or a clear date with a doubtful category. low: guessed, partial or conflicting information.


Tokens such as [ENFANT], [EMAIL], [TELEPHONE], [LIEN] and [NUMERO] replace removed personal data; keep them as they are when you quote.
The announcement is the third-party content. ${UNTRUSTED_DATA_POLICY} Only extract deadlines from it.

Amends. Fill amends only when the announcement moves or cancels a deadline announced earlier ("rectificatif", "avancé", "reporté", "annulé"); otherwise return an empty amends. Amends never changes the rules above for events: a moved deadline still gets its event at the new date, a cancelled one gets none. Each item: kind moved or cancelled; reference, the short French noun phrase naming the earlier deadline as its title would read; referenceDate, the earlier date as YYYY-MM-DD when written, otherwise null.`;

function contextLines(publishedOn: string, publishedTime: string): string[] {
  return [
    `published_at: ${frenchWeekdayOf(publishedOn)} ${publishedOn} ${publishedTime}`,
    `timezone: ${PARIS_TIME_ZONE}`,
  ];
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

const NOT_ESCALATED: readonly ReviewReason[] = [
  "relative_holiday",
  "title_missing",
  "time_unreadable",
];

function escalationReasons(event: ExtractedEvent): ReviewReason[] {
  return event.reviewReasons.filter((reason) => !NOT_ESCALATED.includes(reason));
}

function forReview(event: ExtractedEvent): ExtractedEvent {
  return {
    ...event,
    needsReview: true,
    reviewReasons: [...event.reviewReasons, "second_reading_failed"],
  };
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

interface ExtractionCall {
  userId: string;
  context: string[];
  source: SanitizedAnnouncement;
  publishedOn: string;
}

export class ExtractionService {
  constructor(
    private readonly model: ILanguageModel,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async extract(input: ExtractInput): Promise<Result<ExtractionResult, ExtractionError>> {
    return this.instrumentation.startSpan(
      { name: "ExtractionService > extract", op: "function" },
      async () => {
        const published = utcToZonedWall(input.publishedAt, PARIS_TIME_ZONE);
        if (published.isFailure)
          return Result.fail({
            code: "EXTRACTION_INPUT_INVALID",
            message: "La date de publication de l'annonce est invalide.",
          });

        const publishedOn = published.getValue().date;
        const source = sanitizeWithOffsets(input.text, input.childNames);
        const call: ExtractionCall = {
          userId: input.userId,
          context: contextLines(publishedOn, published.getValue().time),
          source,
          publishedOn,
        };

        const first = await this.pass("fast", call);
        if (first.isFailure) return first;

        const fast = first.getValue();
        const doubtful = fast.events.some(
          (event) => event.needsReview && escalationReasons(event).length > 0,
        );
        if (!doubtful) return first;

        const second = await this.pass("strong", call);
        if (second.isSuccess) return second;

        return Result.ok({ ...fast, events: fast.events.map(forReview) });
      },
    );
  }

  private async pass(
    tier: ModelTier,
    call: ExtractionCall,
  ): Promise<Result<ExtractionResult, ExtractionError>> {
    const output = await this.model.parse({
      scope: { userId: call.userId },
      feature: "announcement_extraction",
      promptVersion: EXTRACTION_PROMPT_VERSION,
      tier,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: EXTRACTION_SYSTEM_PROMPT,
      context: call.context,
      data: call.source.text,
      schema: extractionOutputSchema,
    });
    if (output.isFailure) return Result.fail(extractionErrorOf(output.getError()));

    const events: ExtractedEvent[] = [];
    for (const candidate of output.getValue().events) {
      const event = this.toEvent(candidate, call.source, call.publishedOn);
      if (event.isFailure) return Result.fail(event.getError());

      events.push(event.getValue());
    }

    return Result.ok({ events, amendments: output.getValue().amends.flatMap(toAmendment) });
  }

  private toEvent(
    candidate: ExtractedCandidate,
    source: SanitizedAnnouncement,
    publishedOn: string,
  ): Result<ExtractedEvent, ExtractionError> {
    const category = ExtractionCategory.create(candidate.category);
    if (category.isFailure)
      return Result.fail({
        code: "EXTRACTION_OUTPUT_INVALID",
        message: "Le modèle a renvoyé une catégorie inconnue.",
      });

    const title = truncateOnWord(withoutLinks(candidate.title), EXTRACTED_TITLE_MAX);
    const time = normalizedTime(candidate.deadlineTime);
    const reviewReasons = [
      ...reviewReasonsFor(candidate, { source: source.text, publishedOn }),
      ...this.fieldReasons(title, time.isFailure),
    ];
    const event: ExtractedEvent = {
      title: title || category.getValue().label(),
      description: truncate(withoutLinks(candidate.description), EXTRACTED_DESCRIPTION_MAX),
      category: category.getValue().value,
      deadlineDate: candidate.deadlineDate,
      confidence: cappedConfidence(
        candidate.confidence,
        reviewReasons.includes("relative_holiday"),
      ),
      needsReview: reviewReasons.length > 0,
      reviewReasons,
    };

    return Result.ok(
      this.withOptionalFields(event, time.unwrapOr(Option.none()), candidate, source),
    );
  }

  private fieldReasons(title: string, timeUnreadable: boolean): ReviewReason[] {
    const reasons: ReviewReason[] = [];
    if (title === "") reasons.push("title_missing");
    if (timeUnreadable) reasons.push("time_unreadable");

    return reasons;
  }

  private withOptionalFields(
    event: ExtractedEvent,
    deadlineTime: Option<string>,
    candidate: ExtractedCandidate,
    source: SanitizedAnnouncement,
  ): ExtractedEvent {
    const evidence = this.evidenceOf(candidate.evidenceQuote, source);

    return {
      ...event,
      ...(deadlineTime.isSome() ? { deadlineTime: deadlineTime.unwrap() } : {}),
      ...(evidence.isSome() ? { evidence: evidence.unwrap() } : {}),
    };
  }

  private evidenceOf(quote: string, source: SanitizedAnnouncement): Option<EvidencePassage> {
    return locateQuote(quote, source.text).map(({ start, end }) => ({
      quote: source.text.slice(start, end),
      start: source.rawOffset(start, "start"),
      end: source.rawOffset(end, "end"),
      before: sentenceBefore(source.text, start),
      after: sentenceAfter(source.text, end),
    }));
  }
}

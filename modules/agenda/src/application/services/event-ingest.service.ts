import { type AppError, type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { AgendaEvent } from "../../domain/event.aggregate";
import type { IAlertPlanner } from "../ports/alert-planner.port";
import type { AgendaError, IEventRepository } from "../ports/event-repository.port";
import { parseCategory, parseDeadline, parseDescription, parseTitle } from "./event-fields";

export interface IngestedEvent {
  title: string;
  description: string;
  category: string;
  deadlineDate: string;
  deadlineTime?: string;
  needsReview: boolean;
}

export interface IngestInput {
  userId: string;
  childId: string;
  announcement: { id: string; courseId: string; url: string; publishedAt: Date };
  events: IngestedEvent[];
}

export interface IngestOutput {
  created: number;
  skipped: number;
}

export class EventIngestService {
  constructor(
    private readonly events: IEventRepository,
    private readonly alerts: IAlertPlanner,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async ingest(input: IngestInput): Promise<Result<IngestOutput, AgendaError | AppError>> {
    return this.instrumentation.startSpan(
      { name: "EventIngestService > ingest", op: "function" },
      async () => {
        const built = this.build(input);
        if (built.isFailure) return Result.fail(built.getError());

        return this.transactions.run(async () => {
          const outcome: IngestOutput = { created: 0, skipped: 0 };
          for (const event of built.getValue()) {
            const stored = await this.store(event);
            if (stored.isFailure)
              return Result.fail<IngestOutput, AgendaError | AppError>(stored.getError());

            if (stored.getValue()) outcome.created += 1;
            else outcome.skipped += 1;
          }
          return Result.ok<IngestOutput, AgendaError | AppError>(outcome);
        });
      },
    );
  }

  private build(input: IngestInput): Result<AgendaEvent[], AgendaError> {
    const now = this.clock();
    const built: AgendaEvent[] = [];
    for (const [ordinal, raw] of input.events.entries()) {
      const title = parseTitle(raw.title);
      if (title.isFailure) return Result.fail(title.getError());
      const description = parseDescription(raw.description);
      if (description.isFailure) return Result.fail(description.getError());
      const category = parseCategory(raw.category);
      if (category.isFailure) return Result.fail(category.getError());
      const deadline = parseDeadline(raw.deadlineDate, raw.deadlineTime);
      if (deadline.isFailure) return Result.fail(deadline.getError());

      built.push(
        AgendaEvent.create({
          userId: input.userId,
          childId: input.childId,
          announcementId: input.announcement.id,
          ordinal,
          courseId: input.announcement.courseId,
          announcementUrl: input.announcement.url,
          title: title.getValue(),
          description: description.getValue(),
          category: category.getValue(),
          deadline: deadline.getValue(),
          receivedAt: input.announcement.publishedAt,
          needsReview: raw.needsReview,
          now,
        }),
      );
    }
    return Result.ok(built);
  }

  private async store(event: AgendaEvent): Promise<Result<boolean, AgendaError | AppError>> {
    const inserted = await this.events.insertIfAbsent(event);
    if (inserted.isFailure || !inserted.getValue()) return inserted;

    const eventId = event.id.value;
    await emitEvent(this.outbox, EventTypes.EVENT_CREATED, "event", eventId, {
      userId: event.get("userId"),
      childId: event.get("childId"),
      eventId,
      needsReview: event.needsReview(),
      actorUserId: null,
    });
    if (event.needsReview()) return Result.ok(true);

    const deadline = event.get("deadline").value;
    const planned = await this.alerts.planDefault({
      eventId,
      userId: event.get("userId"),
      deadlineDate: deadline.date,
      deadlineTime: deadline.time,
    });
    return planned.map(() => true);
  }
}

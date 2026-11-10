import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { AgendaEvent, type EventField } from "../../domain/event.aggregate";
import { EventCategory } from "../../domain/value-objects/event-category.vo";
import type { EventDeadline } from "../../domain/value-objects/event-deadline.vo";
import { EventDescription } from "../../domain/value-objects/event-description.vo";
import { EventSource } from "../../domain/value-objects/event-source.vo";
import type { EventTitle } from "../../domain/value-objects/event-title.vo";
import type { IAlertPlanner, PlannedDeadline } from "../ports/alert-planner.port";
import type { IChildOwnership } from "../ports/child-ownership.port";
import type {
  AgendaError,
  CourseworkCourses,
  IEventRepository,
} from "../ports/event-repository.port";
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

export interface IngestedCoursework {
  id: string;
  title: string;
  url: string;
  deadlineDate: string;
  deadlineTime?: string;
  done: boolean;
}

export interface CourseworkIngestInput {
  userId: string;
  childId: string;
  courseId: string;
  items: IngestedCoursework[];
  complete: boolean;
  presentIds: string[];
}

export interface CourseworkIngestOutput {
  created: number;
  updated: number;
  rejected: number;
  withdrawn: number;
}

export interface CourseworkWithdrawInput {
  userId: string;
  childId: string;
  activeCourseIds: string[];
}

export interface CourseworkWithdrawOutput {
  withdrawn: number;
}

type IngestError = AgendaError | AppError;

type CourseworkOutcome = "created" | "updated" | "unchanged";

interface ParsedCoursework {
  item: IngestedCoursework;
  title: EventTitle;
  deadline: EventDeadline;
}

function plannedDeadline(event: AgendaEvent): PlannedDeadline {
  const deadline = event.get("deadline").value;

  return {
    eventId: event.id.value,
    userId: event.get("userId"),
    deadlineDate: deadline.date,
    deadlineTime: deadline.time,
  };
}

const childNotFound: AgendaError = {
  code: "EVENT_CHILD_NOT_FOUND",
  message: "Cet enfant n'est pas relié à votre compte, ses événements ne sont pas enregistrés.",
};

export class EventIngestService {
  constructor(
    private readonly events: IEventRepository,
    private readonly children: IChildOwnership,
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

        const owned = await this.children.isOwnedBy(input.userId, input.childId);
        if (owned.isFailure) return Result.fail(owned.getError());
        if (!owned.getValue()) return Result.fail(childNotFound);

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

  async ingestCoursework(
    input: CourseworkIngestInput,
  ): Promise<Result<CourseworkIngestOutput, IngestError>> {
    return this.instrumentation.startSpan(
      { name: "EventIngestService > ingestCoursework", op: "function" },
      async () => {
        const owned = await this.children.isOwnedBy(input.userId, input.childId);
        if (owned.isFailure) return Result.fail(owned.getError());
        if (!owned.getValue()) return Result.fail(childNotFound);

        return this.transactions.run(async () => {
          const outcome: CourseworkIngestOutput = {
            created: 0,
            updated: 0,
            rejected: 0,
            withdrawn: 0,
          };
          for (const item of input.items) {
            const parsed = this.parseCoursework(item);
            if (parsed.isNone()) {
              outcome.rejected += 1;
              continue;
            }

            const applied = await this.applyCoursework(input, parsed.unwrap());
            if (applied.isFailure)
              return Result.fail<CourseworkIngestOutput, IngestError>(applied.getError());
            if (applied.getValue() === "created") outcome.created += 1;
            if (applied.getValue() === "updated") outcome.updated += 1;
          }
          if (!input.complete) return Result.ok<CourseworkIngestOutput, IngestError>(outcome);

          const withdrawn = await this.withdrawLive(
            input,
            { courseId: input.courseId },
            input.presentIds,
          );
          return withdrawn.map((count) => ({ ...outcome, withdrawn: count }));
        });
      },
    );
  }

  async withdrawCourseworkOutside(
    input: CourseworkWithdrawInput,
  ): Promise<Result<CourseworkWithdrawOutput, IngestError>> {
    return this.instrumentation.startSpan(
      { name: "EventIngestService > withdrawCourseworkOutside", op: "function" },
      async () => {
        const owned = await this.children.isOwnedBy(input.userId, input.childId);
        if (owned.isFailure) return Result.fail(owned.getError());
        if (!owned.getValue()) return Result.fail(childNotFound);

        return this.transactions.run(async () => {
          const withdrawn = await this.withdrawLive(
            input,
            { outsideCourseIds: input.activeCourseIds },
            [],
          );
          return withdrawn.map((count) => ({ withdrawn: count }));
        });
      },
    );
  }

  private async withdrawLive(
    { userId, childId }: { userId: string; childId: string },
    courses: CourseworkCourses,
    presentIds: string[],
  ): Promise<Result<number, IngestError>> {
    const live = await this.events.lockLiveCoursework(userId, childId, courses);
    if (live.isFailure) return Result.fail(live.getError());

    const listed = new Set(presentIds);
    let withdrawn = 0;
    for (const event of live.getValue()) {
      if (listed.has(event.get("announcementId"))) continue;
      if (event.withdraw(this.clock()).isFailure) continue;

      const saved = await this.saveFollowed(event, ["withdrawn"]);
      if (saved.isFailure) return Result.fail(saved.getError());
      withdrawn += 1;
    }
    return Result.ok(withdrawn);
  }

  private parseCoursework(item: IngestedCoursework): Option<ParsedCoursework> {
    const title = parseTitle(item.title);
    const deadline = parseDeadline(item.deadlineDate, item.deadlineTime);
    if (title.isSuccess && deadline.isSuccess)
      return Option.some({ item, title: title.getValue(), deadline: deadline.getValue() });

    this.instrumentation.capture(new Error(`coursework ${item.id} has no valid title or due date`));
    return Option.none();
  }

  private async applyCoursework(
    input: CourseworkIngestInput,
    { item, title, deadline }: ParsedCoursework,
  ): Promise<Result<CourseworkOutcome, IngestError>> {
    const found = await this.events.lockCoursework(input.userId, input.childId, item.id);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) {
      const event = AgendaEvent.create({
        userId: input.userId,
        childId: input.childId,
        source: EventSource.coursework(),
        announcementId: item.id,
        ordinal: 0,
        courseId: input.courseId,
        announcementUrl: item.url,
        title,
        description: EventDescription.create("").getValue(),
        category: EventCategory.create("homework").getValue(),
        deadline,
        receivedAt: this.clock(),
        needsReview: false,
        done: item.done,
        now: this.clock(),
      });
      const stored = await this.store(event);
      return stored.map((created) => (created ? "created" : "unchanged"));
    }

    const event = found.getValue().unwrap();
    const followed = event.followCoursework({ title, deadline, done: item.done });
    if (followed.isFailure || followed.getValue().length === 0) return Result.ok("unchanged");

    return this.saveFollowed(event, followed.getValue());
  }

  private async saveFollowed(
    event: AgendaEvent,
    fields: EventField[],
  ): Promise<Result<CourseworkOutcome, IngestError>> {
    const saved = await this.events.save(event);
    if (saved.isFailure) return Result.fail(saved.getError());

    const alerted = await this.realert(event, fields);
    if (alerted.isFailure) return Result.fail(alerted.getError());

    await emitEvent(this.outbox, EventTypes.EVENT_UPDATED, "event", event.id.value, {
      userId: event.get("userId"),
      eventId: event.id.value,
      fields,
    });
    return Result.ok("updated");
  }

  private async realert(event: AgendaEvent, fields: EventField[]): Promise<Result<void, AppError>> {
    if (event.get("withdrawnAt").isSome()) return this.alerts.cancel(event.id.value);
    if (event.get("done") && fields.includes("done")) return this.alerts.cancel(event.id.value);
    if (event.get("done")) return Result.ok();
    if (fields.includes("withdrawn") || fields.includes("done"))
      return this.alerts.planDefault(plannedDeadline(event));
    if (fields.includes("deadline")) return this.alerts.replan(plannedDeadline(event));

    return Result.ok();
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
          source: EventSource.announcement(),
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
          done: false,
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
    if (event.needsReview() || event.get("done")) return Result.ok(true);

    const planned = await this.alerts.planDefault(plannedDeadline(event));
    return planned.map(() => true);
  }
}

import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
  traced,
} from "@packages/ddd-kit";
import { shiftInstant } from "@packages/ddd-kit/days";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { AgendaEvent, type EventField } from "../../domain/event.aggregate";
import { amendedEvent } from "../../domain/services/amended-event";
import { type AmendmentKind, EventAmendment } from "../../domain/value-objects/event-amendment.vo";
import { EventCategory } from "../../domain/value-objects/event-category.vo";
import type { EventDeadline } from "../../domain/value-objects/event-deadline.vo";
import { EventDescription } from "../../domain/value-objects/event-description.vo";
import { EventSource } from "../../domain/value-objects/event-source.vo";
import type { EventTitle } from "../../domain/value-objects/event-title.vo";
import type { IAlertPlanner } from "../ports/alert-planner.port";
import type { IChildOwnership } from "../ports/child-ownership.port";
import {
  type AgendaError,
  type CourseDay,
  type CourseworkCourses,
  childNotFound,
  type IEventRepository,
} from "../ports/event-repository.port";
import { type AnnouncementReconciler, courseDayOf } from "./announcement-reconciler";
import {
  parseClassroomCategory,
  parseComputedDeadline,
  parseDescription,
  parseTitle,
} from "./event-fields";
import { plannedDeadline } from "./planned-deadline";

export interface IngestedEvent {
  title: string;
  description: string;
  category: string;
  deadlineDate: string;
  deadlineTime?: string;
  needsReview: boolean;
}

export interface IngestedAmendment {
  kind: AmendmentKind;
  reference: string;
  referenceDate?: string;
}

export interface IngestInput {
  userId: string;
  childId: string;
  announcement: { id: string; courseId: string; url: string; publishedAt: Date };
  events: IngestedEvent[];
  amendments: IngestedAmendment[];
}

export interface IngestOutput {
  created: number;
  skipped: number;
  flagged: number;
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

export class EventIngestService {
  constructor(
    private readonly events: IEventRepository,
    private readonly children: IChildOwnership,
    private readonly alerts: IAlertPlanner,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly reconciler: AnnouncementReconciler,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async ingest(input: IngestInput): Promise<Result<IngestOutput, AgendaError | AppError>> {
    return traced(this.instrumentation, "EventIngestService > ingest", async () => {
      const built = this.build(input);
      if (built.isFailure) return Result.fail(built.getError());
      const amendments = this.parseAmendments(input.amendments);

      const owned = await this.children.isOwnedBy(input.userId, input.childId);
      if (owned.isFailure) return Result.fail(owned.getError());
      if (!owned.getValue()) return Result.fail(childNotFound);

      return this.transactions.run(async () => {
        const stored = await this.storeAll(built.getValue());
        if (stored.isFailure) return Result.fail<IngestOutput, IngestError>(stored.getError());

        const reconciled = await this.reconciler.reconcile(
          input.userId,
          this.daysOf(built.getValue()),
          { actorUserId: null, now: this.clock() },
        );
        if (reconciled.isFailure)
          return Result.fail<IngestOutput, IngestError>(reconciled.getError());

        const flagged = await this.flagAmended(input, built.getValue(), amendments);
        return flagged.map((count) => ({ ...stored.getValue(), flagged: count }));
      });
    });
  }

  private async storeAll(
    events: AgendaEvent[],
  ): Promise<Result<Omit<IngestOutput, "flagged">, IngestError>> {
    const outcome = { created: 0, skipped: 0 };
    for (const event of events) {
      const stored = await this.store(event);
      if (stored.isFailure) return Result.fail(stored.getError());

      if (stored.getValue()) outcome.created += 1;
      else outcome.skipped += 1;
    }
    return Result.ok(outcome);
  }

  private parseAmendments(amendments: IngestedAmendment[]): EventAmendment[] {
    return amendments.flatMap((amendment) => {
      const parsed = EventAmendment.create(amendment);
      if (parsed.isSuccess) return [parsed.getValue()];

      this.instrumentation.capture(new Error(`amendment ignored: ${parsed.getError()}`));
      return [];
    });
  }

  private async flagAmended(
    input: IngestInput,
    created: AgendaEvent[],
    amendments: EventAmendment[],
  ): Promise<Result<number, IngestError>> {
    if (amendments.length === 0) return Result.ok(0);

    const { announcement } = input;
    const candidates = await this.events.lockLiveAnnouncements(
      input.userId,
      { childId: input.childId, courseId: announcement.courseId },
      shiftInstant(announcement.publishedAt, -1),
    );
    if (candidates.isFailure) return Result.fail(candidates.getError());

    const by = {
      announcementId: announcement.id,
      newDates: created.map((event) => event.get("deadline").value.date),
    };
    let flagged = 0;
    for (const amendment of amendments) {
      const target = amendedEvent(candidates.getValue(), amendment, by);
      if (target.isNone()) continue;

      const applied = await this.flag(target.unwrap(), amendment, announcement.id);
      if (applied.isFailure) return Result.fail(applied.getError());
      if (applied.getValue()) flagged += 1;
    }
    return Result.ok(flagged);
  }

  private async flag(
    event: AgendaEvent,
    amendment: EventAmendment,
    amendingAnnouncementId: string,
  ): Promise<Result<boolean, IngestError>> {
    const flagged = event.flagForReview();
    if (flagged.isFailure || !flagged.getValue()) return Result.ok(false);

    const saved = await this.events.save(event);
    if (saved.isFailure) return Result.fail(saved.getError());

    const cancelled = await this.alerts.cancel(event.id.value, null);
    if (cancelled.isFailure) return Result.fail(cancelled.getError());

    await emitEvent(this.outbox, EventTypes.EVENT_FLAGGED, "event", event.id.value, {
      userId: event.get("userId"),
      childId: event.get("childId"),
      eventId: event.id.value,
      reason: amendment.value.kind,
      reference: amendment.value.reference,
      amendingAnnouncementId,
      actorUserId: null,
    });
    return Result.ok(true);
  }

  private daysOf(events: AgendaEvent[]): CourseDay[] {
    return events.flatMap((event) =>
      courseDayOf(event)
        .map((day) => [day])
        .unwrapOr([]),
    );
  }

  async ingestCoursework(
    input: CourseworkIngestInput,
  ): Promise<Result<CourseworkIngestOutput, IngestError>> {
    return traced(this.instrumentation, "EventIngestService > ingestCoursework", async () => {
      const owned = await this.children.isOwnedBy(input.userId, input.childId);
      if (owned.isFailure) return Result.fail(owned.getError());
      if (!owned.getValue()) return Result.fail(childNotFound);

      const parsed = input.items.flatMap((item) =>
        this.parseCoursework(item)
          .map((coursework) => [coursework])
          .unwrapOr([]),
      );

      return this.transactions.run(async () => {
        const outcome: CourseworkIngestOutput = {
          created: 0,
          updated: 0,
          rejected: input.items.length - parsed.length,
          withdrawn: 0,
        };
        const locked = await this.events.lockCourseworkItems(
          input.userId,
          input.childId,
          parsed.map(({ item }) => item.id),
        );
        if (locked.isFailure)
          return Result.fail<CourseworkIngestOutput, IngestError>(locked.getError());

        const days = [
          ...this.daysOf(locked.getValue()),
          ...parsed.map(({ deadline }) => ({
            childId: input.childId,
            courseId: input.courseId,
            deadlineDate: deadline.value.date,
          })),
        ];
        const storedById = new Map(
          locked.getValue().map((event) => [event.get("announcementId"), event]),
        );
        for (const coursework of parsed) {
          const stored = Option.fromNullable(storedById.get(coursework.item.id));
          const applied = await this.applyCoursework(input, coursework, stored);
          if (applied.isFailure)
            return Result.fail<CourseworkIngestOutput, IngestError>(applied.getError());
          if (applied.getValue() === "created") outcome.created += 1;
          if (applied.getValue() === "updated") outcome.updated += 1;
        }

        const withdrawn = input.complete
          ? await this.withdrawLive(input, { courseId: input.courseId }, input.presentIds)
          : Result.ok<AgendaEvent[], IngestError>([]);
        if (withdrawn.isFailure)
          return Result.fail<CourseworkIngestOutput, IngestError>(withdrawn.getError());

        const reconciled = await this.reconcileAfterSync(input.userId, [
          ...days,
          ...this.daysOf(withdrawn.getValue()),
        ]);
        return reconciled.map(() => ({ ...outcome, withdrawn: withdrawn.getValue().length }));
      });
    });
  }

  async withdrawCourseworkOutside(
    input: CourseworkWithdrawInput,
  ): Promise<Result<CourseworkWithdrawOutput, IngestError>> {
    return traced(
      this.instrumentation,
      "EventIngestService > withdrawCourseworkOutside",
      async () => {
        const owned = await this.children.isOwnedBy(input.userId, input.childId);
        if (owned.isFailure) return Result.fail(owned.getError());
        if (!owned.getValue()) return Result.fail(childNotFound);

        return this.transactions.run(async () => {
          const withdrawn = await this.withdrawLive(
            input,
            { outsideCourseIds: input.activeCourseIds, dueFrom: this.clock() },
            [],
          );
          if (withdrawn.isFailure)
            return Result.fail<CourseworkWithdrawOutput, IngestError>(withdrawn.getError());

          const reconciled = await this.reconcileAfterSync(
            input.userId,
            this.daysOf(withdrawn.getValue()),
          );
          return reconciled.map(() => ({ withdrawn: withdrawn.getValue().length }));
        });
      },
    );
  }

  private reconcileAfterSync(userId: string, days: CourseDay[]): Promise<Result<void, AppError>> {
    return this.reconciler.reconcile(userId, days, { actorUserId: null, now: this.clock() });
  }

  private async withdrawLive(
    { userId, childId }: { userId: string; childId: string },
    courses: CourseworkCourses,
    presentIds: string[],
  ): Promise<Result<AgendaEvent[], IngestError>> {
    const live = await this.events.lockLiveCoursework(userId, childId, courses);
    if (live.isFailure) return Result.fail(live.getError());

    const listed = new Set(presentIds);
    const withdrawn: AgendaEvent[] = [];
    for (const event of live.getValue()) {
      if (listed.has(event.get("announcementId"))) continue;
      if (event.withdraw(this.clock()).isFailure) continue;

      const saved = await this.saveFollowed(event, ["withdrawn"]);
      if (saved.isFailure) return Result.fail(saved.getError());
      withdrawn.push(event);
    }
    return Result.ok(withdrawn);
  }

  private parseCoursework(item: IngestedCoursework): Option<ParsedCoursework> {
    const title = parseTitle(item.title);
    const deadline = parseComputedDeadline(item.deadlineDate, item.deadlineTime);
    if (title.isSuccess && deadline.isSuccess)
      return Option.some({ item, title: title.getValue(), deadline: deadline.getValue() });

    this.instrumentation.capture(new Error(`coursework ${item.id} has no valid title or due date`));
    return Option.none();
  }

  private async applyCoursework(
    input: CourseworkIngestInput,
    { item, title, deadline }: ParsedCoursework,
    stored: Option<AgendaEvent>,
  ): Promise<Result<CourseworkOutcome, IngestError>> {
    if (stored.isNone()) {
      const event = AgendaEvent.create({
        userId: input.userId,
        childId: input.childId,
        source: EventSource.coursework(),
        announcementId: item.id,
        ordinal: 0,
        courseId: Option.some(input.courseId),
        announcementUrl: Option.some(item.url),
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

    const event = stored.unwrap();
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
      actorUserId: null,
    });
    return Result.ok("updated");
  }

  private async realert(event: AgendaEvent, fields: EventField[]): Promise<Result<void, AppError>> {
    if (event.get("withdrawnAt").isSome()) return this.alerts.cancel(event.id.value, null);
    if (event.get("done") && fields.includes("done"))
      return this.alerts.cancel(event.id.value, null);
    if (event.get("done")) return Result.ok();
    if (fields.includes("withdrawn") || fields.includes("done"))
      return this.alerts.planDefault(plannedDeadline(event, null));
    if (fields.includes("deadline")) return this.alerts.replan(plannedDeadline(event, null));

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
      const category = parseClassroomCategory(raw.category);
      if (category.isFailure) return Result.fail(category.getError());
      const deadline = parseComputedDeadline(raw.deadlineDate, raw.deadlineTime);
      if (deadline.isFailure) return Result.fail(deadline.getError());

      built.push(
        AgendaEvent.create({
          userId: input.userId,
          childId: input.childId,
          source: EventSource.announcement(),
          announcementId: input.announcement.id,
          ordinal,
          courseId: Option.some(input.announcement.courseId),
          announcementUrl: Option.some(input.announcement.url),
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

    const planned = await this.alerts.planDefault(plannedDeadline(event, null));
    return planned.map(() => true);
  }
}

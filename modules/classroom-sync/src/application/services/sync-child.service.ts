import {
  type AppError,
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  mapBounded,
  Option,
  Result,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import { nextDelayMs } from "@packages/outbox/jitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  extractedVerdict,
  failedVerdict,
  type LedgerVerdict,
  nextAttempt,
} from "../../domain/announcement-ledger";
import { ALERT_LEAD_MS, nextSyncAt, retryAt } from "../../domain/sync-window";
import {
  type IAnnouncementExtractor,
  isExtractorOutage,
} from "../ports/announcement-extractor.port";
import type { IChildAccessTokens } from "../ports/child-access-tokens.port";
import type { IChildSyncState, ReconnectCause, SyncLease } from "../ports/child-sync-state.port";
import type {
  Announcement,
  ClassroomErrorCode,
  Course,
  ReadScope,
} from "../ports/classroom-client.port";
import type {
  ClassroomAccess,
  CourseFailure,
  CourseList,
  CourseRead,
  IClassroomReader,
  PendingAnnouncement,
} from "../ports/classroom-reader.port";
import type { IEventIngest } from "../ports/event-ingest.port";
import type { ISeenAnnouncementRepository } from "../ports/seen-announcement-repository.port";
import type { IUpcomingAlerts } from "../ports/upcoming-alerts.port";
import type { SyncError } from "../sync-error";

const COURSE_CONCURRENCY = 4;
const EXTRACTION_CONCURRENCY = 8;
const SYNC_JITTER_BASE_MS = 60_000;

const SYNC_ERROR_CODES: readonly string[] = [
  "SYNC_CHILD_NOT_FOUND",
  "SYNC_BLOCKED",
  "SYNC_LEASE_CONFLICT",
  "SYNC_PROVIDER_FAILURE",
] satisfies SyncError["code"][];

const isSyncCode = (code: string): code is SyncError["code"] => SYNC_ERROR_CODES.includes(code);

const leaseLost: SyncError = {
  code: "SYNC_LEASE_CONFLICT",
  message: "Cette synchronisation a été reprise par une autre tâche, son résultat est ignoré.",
};

const blocked: SyncError = {
  code: "SYNC_BLOCKED",
  message: "L'accès à Classroom de cet enfant ne fonctionne plus, sa fiche indique quoi faire.",
};

const providerFailure = (step: string, cause?: unknown): SyncError => ({
  code: "SYNC_PROVIDER_FAILURE",
  message: `La synchronisation a échoué (${step}), elle sera relancée dans quelques minutes.`,
  cause,
});

function asSyncError(error: AppError, step: string): SyncError {
  const { code, message, cause } = error;
  if (!isSyncCode(code)) return providerFailure(step, cause);

  return { code, message, cause };
}

export interface SyncChildInput {
  userId: string;
  childId: string;
  label: string;
  lease: number;
}

export interface SyncReport {
  courses: number;
  skippedCourses: number;
  newAnnouncements: number;
  eventsCreated: number;
  failedAnnouncements: number;
  failedCoursework: number;
}

type SyncOutcome = { kind: "done"; created: number } | { kind: "failed" } | { kind: "lease_lost" };

export class SyncChildService {
  constructor(
    private readonly reader: IClassroomReader,
    private readonly tokens: IChildAccessTokens,
    private readonly extractor: IAnnouncementExtractor,
    private readonly events: IEventIngest,
    private readonly alerts: IUpcomingAlerts,
    private readonly syncState: IChildSyncState,
    private readonly ledger: ISeenAnnouncementRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly logger: ILogger,
  ) {}

  async syncChild(input: SyncChildInput, now: Date): Promise<Result<SyncReport, SyncError>> {
    return this.instrumentation.startSpan(
      { name: "SyncChildService > syncChild", op: "function" },
      async () => {
        const lease: SyncLease = { childId: input.childId, lease: input.lease };
        const held = await this.leaseStillHeld(lease);
        if (held.isFailure) return Result.fail(held.getError());

        const token = await this.tokens.accessTokenFor(input.childId);
        if (token.isFailure && token.getError() === "reconnect_needed")
          return this.needsReconnect(input.childId, "invalid_grant");
        if (token.isFailure) return this.failed(lease, now, providerFailure("jeton Google"));

        const access: ClassroomAccess = { token: token.getValue(), scope: this.readScope(lease) };
        const courses = await this.reader.listCourses(access);
        if (courses.isFailure) return this.courseListFailed(lease, courses.getError(), now);

        return this.syncCourses(input, lease, access, courses.getValue(), now);
      },
    );
  }

  private async syncCourses(
    input: SyncChildInput,
    lease: SyncLease,
    access: ClassroomAccess,
    { courses, complete }: CourseList,
    now: Date,
  ): Promise<Result<SyncReport, SyncError>> {
    const reads = await mapBounded(courses, COURSE_CONCURRENCY, (course) =>
      this.reader.readCourse(input.childId, access, course, now),
    );
    const failures = reads.filter((read) => read.isFailure).map((read) => read.getError());
    if (failures.includes("lease_lost")) return Result.fail(leaseLost);
    if (failures.includes("reconnect")) return this.needsReconnect(input.childId, "invalid_grant");
    if (failures.includes("misconfigured")) this.alertOperator(input.childId);
    if (courses.length > 0 && failures.length === courses.length) {
      if (failures.every((failure) => failure === "school_block"))
        return this.needsReconnect(input.childId, "school_blocked");
      return this.failed(lease, now, providerFailure("annonces"));
    }

    const read = reads.flatMap((course) => (course.isSuccess ? [course.getValue()] : []));
    const saved = await mapBounded(read, COURSE_CONCURRENCY, (course) =>
      this.saveCoursework(input, lease, course),
    );
    const pending = read.flatMap((course) => course.pending);
    const extracted = await this.extractAll(input, lease, access.token, pending, now);
    if ([...saved, ...extracted].some(({ kind }) => kind === "lease_lost"))
      return Result.fail(leaseLost);
    if (complete && (await this.withdrawOutside(input, lease, courses)).kind === "lease_lost")
      return Result.fail(leaseLost);

    return this.finish(input, lease, now, {
      courses: courses.length,
      skippedCourses: failures.length,
      newAnnouncements: pending.length,
      eventsCreated: [...saved, ...extracted].reduce(
        (sum, outcome) => sum + (outcome.kind === "done" ? outcome.created : 0),
        0,
      ),
      failedAnnouncements: extracted.filter(({ kind }) => kind === "failed").length,
      failedCoursework: saved.filter(({ kind }) => kind === "failed").length,
    });
  }

  private async saveCoursework(
    input: SyncChildInput,
    lease: SyncLease,
    { courseId, coursework, courseworkComplete, presentIds }: CourseRead,
  ): Promise<SyncOutcome> {
    const saved = await this.transactions.run(async (): Promise<Result<number, AppError>> => {
      const held = await this.leaseStillHeld(lease);
      if (held.isFailure) return Result.fail(held.getError());

      const ingested = await this.events.ingestCoursework({
        userId: input.userId,
        childId: input.childId,
        courseId,
        items: coursework,
        complete: courseworkComplete,
        presentIds,
      });
      return ingested.map(({ created }) => created);
    });
    if (saved.isSuccess) return { kind: "done", created: saved.getValue() };
    if (saved.getError().code === leaseLost.code) return { kind: "lease_lost" };

    this.instrumentation.capture(saved.getError(), { metadata: { childId: input.childId } });
    return { kind: "failed" };
  }

  private async withdrawOutside(
    input: SyncChildInput,
    lease: SyncLease,
    courses: Course[],
  ): Promise<SyncOutcome> {
    const withdrawn = await this.transactions.run(async (): Promise<Result<number, AppError>> => {
      const held = await this.leaseStillHeld(lease);
      if (held.isFailure) return Result.fail(held.getError());

      const done = await this.events.withdrawCourseworkOutside({
        userId: input.userId,
        childId: input.childId,
        activeCourseIds: courses.map(({ id }) => id),
      });
      return done.map(({ withdrawn }) => withdrawn);
    });
    if (withdrawn.isSuccess) return { kind: "done", created: 0 };
    if (withdrawn.getError().code === leaseLost.code) return { kind: "lease_lost" };

    this.instrumentation.capture(withdrawn.getError(), { metadata: { childId: input.childId } });
    return { kind: "failed" };
  }

  private async extractAll(
    input: SyncChildInput,
    lease: SyncLease,
    token: string,
    pending: PendingAnnouncement[],
    now: Date,
  ): Promise<SyncOutcome[]> {
    if (pending.length === 0) return [];

    const names = await this.reader.profileNames(token);
    if (names.isFailure) {
      this.instrumentation.capture(names.getError(), { metadata: { childId: input.childId } });
      return pending.map((): SyncOutcome => ({ kind: "failed" }));
    }

    const childNames = [...new Set([input.label, ...names.getValue()])];
    return mapBounded(pending, EXTRACTION_CONCURRENCY, (item) =>
      this.processAnnouncement(input, lease, item, childNames, now),
    );
  }

  private async processAnnouncement(
    input: SyncChildInput,
    lease: SyncLease,
    { announcement, state }: PendingAnnouncement,
    childNames: string[],
    now: Date,
  ): Promise<SyncOutcome> {
    const attempt = nextAttempt(state);
    const held = await this.leaseStillHeld(lease);
    if (held.isFailure)
      return held.getError().code === leaseLost.code ? { kind: "lease_lost" } : { kind: "failed" };

    const extracted = await this.extractor.extract({
      text: announcement.text,
      publishedAt: announcement.publishedAt,
      childNames,
    });
    if (extracted.isFailure) {
      this.instrumentation.capture(extracted.getError(), { metadata: { childId: input.childId } });
      if (isExtractorOutage(extracted.getError())) return { kind: "failed" };

      return this.recordFailure(lease, announcement, attempt, now);
    }

    const deadlines = extracted.getValue();
    const committed = await this.transactions.run(async (): Promise<Result<number, AppError>> => {
      const recorded = await this.recordVerdict(
        lease,
        announcement,
        extractedVerdict(attempt, deadlines.length),
        now,
      );
      if (recorded.isFailure) return Result.fail(recorded.getError());
      if (!recorded.getValue() || deadlines.length === 0) return Result.ok(0);

      const ingested = await this.events.ingest({
        userId: input.userId,
        childId: input.childId,
        announcement: {
          id: announcement.id,
          courseId: announcement.courseId,
          url: announcement.url,
          publishedAt: announcement.publishedAt,
        },
        events: deadlines,
      });
      return ingested.map(({ created }) => created);
    });
    if (committed.isSuccess) return { kind: "done", created: committed.getValue() };
    if (committed.getError().code === leaseLost.code) return { kind: "lease_lost" };

    this.instrumentation.capture(committed.getError(), { metadata: { childId: input.childId } });
    return this.recordFailure(lease, announcement, attempt, now);
  }

  private async recordFailure(
    lease: SyncLease,
    announcement: Announcement,
    attempt: number,
    now: Date,
  ): Promise<SyncOutcome> {
    const recorded = await this.transactions.run(() =>
      this.recordVerdict(lease, announcement, failedVerdict(attempt), now),
    );
    if (recorded.isFailure && recorded.getError().code === leaseLost.code)
      return { kind: "lease_lost" };
    if (recorded.isFailure)
      this.instrumentation.capture(recorded.getError(), { metadata: { childId: lease.childId } });

    return { kind: "failed" };
  }

  private async recordVerdict(
    lease: SyncLease,
    announcement: Announcement,
    verdict: LedgerVerdict,
    now: Date,
  ): Promise<Result<boolean, SyncError>> {
    const held = await this.leaseStillHeld(lease);
    if (held.isFailure) return Result.fail(held.getError());

    return this.ledger.record({
      childId: lease.childId,
      announcementId: announcement.id,
      courseId: announcement.courseId,
      outcome: verdict.outcome,
      attempts: verdict.attempts,
      seenAt: now,
    });
  }

  private async finish(
    input: SyncChildInput,
    lease: SyncLease,
    now: Date,
    report: SyncReport,
  ): Promise<Result<SyncReport, SyncError>> {
    const next = await this.plannedNextSync(input, now);
    const done = await this.transactions.run(async (): Promise<Result<void, AppError>> => {
      const marked = await this.syncState.markSynced(lease, now, next);
      if (marked.isFailure) return marked;

      await emitEvent(this.outbox, EventTypes.ANNOUNCEMENT_SYNCED, "child", input.childId, {
        userId: input.userId,
        childId: input.childId,
        newAnnouncements: report.newAnnouncements,
        eventsCreated: report.eventsCreated,
        actorUserId: null,
      });
      return Result.ok();
    });
    if (done.isFailure) {
      this.instrumentation.capture(done.getError(), { metadata: { childId: input.childId } });
      return Result.fail(asSyncError(done.getError(), "fin de synchronisation"));
    }

    return Result.ok(report);
  }

  private async plannedNextSync(input: SyncChildInput, now: Date): Promise<Date> {
    const alert = await this.alerts.nextAlertAt(
      input.userId,
      input.childId,
      new Date(now.getTime() + ALERT_LEAD_MS),
    );
    if (alert.isFailure)
      this.instrumentation.capture(alert.getError(), { metadata: { childId: input.childId } });

    return nextSyncAt(now, {
      jitterMs: nextDelayMs(SYNC_JITTER_BASE_MS),
      nextAlertAt: alert.isSuccess ? alert.getValue() : Option.none(),
    });
  }

  private readScope(lease: SyncLease): ReadScope {
    return {
      mayContinue: async () => (await this.leaseStillHeld(lease)).isSuccess,
      truncated: (listing) =>
        this.logger.warn(
          { childId: lease.childId, listing },
          "classroom listing cut at the page cap",
        ),
    };
  }

  private async courseListFailed(
    lease: SyncLease,
    failure: CourseFailure,
    now: Date,
  ): Promise<Result<SyncReport, SyncError>> {
    if (failure === "lease_lost") return Result.fail(leaseLost);
    if (failure === "reconnect") return this.needsReconnect(lease.childId, "invalid_grant");
    if (failure === "school_block") return this.needsReconnect(lease.childId, "school_blocked");
    if (failure === "misconfigured") this.alertOperator(lease.childId);

    return this.failed(lease, now, providerFailure("liste des cours"));
  }

  private alertOperator(childId: string): void {
    const code: ClassroomErrorCode = "CLASSROOM_SERVICE_DISABLED";
    this.logger.error(
      { childId, code },
      "classroom api is disabled in the app's google cloud project, every sync fails until it is enabled",
    );
    this.instrumentation.capture(new Error("classroom api disabled in the app's google project"), {
      metadata: { childId, code },
    });
  }

  private async leaseStillHeld(lease: SyncLease): Promise<Result<void, SyncError>> {
    const held = await this.syncState.holdsLease(lease);
    if (held.isFailure) {
      this.instrumentation.capture(held.getError(), { metadata: { childId: lease.childId } });
      return Result.fail(providerFailure("état de l'enfant", held.getError().cause));
    }
    if (!held.getValue()) return Result.fail(leaseLost);

    return Result.ok();
  }

  private async needsReconnect(
    childId: string,
    cause: ReconnectCause,
  ): Promise<Result<SyncReport, SyncError>> {
    const marked = await this.syncState.markNeedsReconnect(childId, cause);
    if (marked.isFailure)
      this.instrumentation.capture(marked.getError(), { metadata: { childId } });

    return Result.fail(blocked);
  }

  private async failed(
    lease: SyncLease,
    now: Date,
    error: SyncError,
  ): Promise<Result<SyncReport, SyncError>> {
    const marked = await this.syncState.markSyncFailed(lease, retryAt(now));
    if (marked.isFailure)
      this.instrumentation.capture(marked.getError(), { metadata: { childId: lease.childId } });

    return Result.fail(error);
  }
}

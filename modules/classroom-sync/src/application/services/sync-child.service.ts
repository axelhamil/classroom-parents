import {
  type AppError,
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
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
  type LedgerState,
  type LedgerVerdict,
  needsExtraction,
  nextAttempt,
} from "../../domain/announcement-ledger";
import { courseworkTitle, schoolDeadline } from "../../domain/coursework-deadline";
import {
  isDayWithinWindow,
  isWithinWindow,
  nextSyncAt,
  retryAt,
  windowStart,
} from "../../domain/sync-window";
import type { IAnnouncementExtractor } from "../ports/announcement-extractor.port";
import type { IChildAccessTokens } from "../ports/child-access-tokens.port";
import type { IChildSyncState, ReconnectCause, SyncLease } from "../ports/child-sync-state.port";
import type {
  Announcement,
  ClassroomError,
  ClassroomErrorCode,
  ClassroomListing,
  Course,
  Coursework,
  IClassroomClient,
  ReadScope,
} from "../ports/classroom-client.port";
import type { CourseworkDeadline, IEventIngest } from "../ports/event-ingest.port";
import type { ISeenAnnouncementRepository } from "../ports/seen-announcement-repository.port";
import type { SyncError } from "../sync-error";
import { runPooled } from "./run-pooled";

const COURSE_CONCURRENCY = 4;
const EXTRACTION_CONCURRENCY = 8;
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 2_000;
const SYNC_JITTER_BASE_MS = 60_000;

const SCHOOL_BLOCKS: readonly ClassroomErrorCode[] = [
  "CLASSROOM_UNAUTHORIZED",
  "CLASSROOM_PERMISSION_DENIED",
  "CLASSROOM_ACCESS_NOT_CONFIGURED",
];

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

const providerFailure = (step: string): SyncError => ({
  code: "SYNC_PROVIDER_FAILURE",
  message: `La synchronisation a échoué (${step}), elle sera relancée dans quelques minutes.`,
});

function asSyncError(error: AppError, step: string): SyncError {
  const { code, message } = error;
  if (!isSyncCode(code)) return providerFailure(step);

  return { code, message };
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

type CourseFailure = "lease_lost" | "scope_missing" | "school_block" | "transient";

interface PendingAnnouncement {
  announcement: Announcement;
  state: Option<LedgerState>;
}

interface CourseRead {
  courseId: string;
  pending: PendingAnnouncement[];
  coursework: CourseworkDeadline[];
  courseworkComplete: boolean;
  presentIds: string[];
}

interface CourseList {
  courses: Course[];
  complete: boolean;
}

function trackCuts(scope: ReadScope): { scope: ReadScope; cut: Set<ClassroomListing> } {
  const cut = new Set<ClassroomListing>();
  return {
    cut,
    scope: {
      mayContinue: () => scope.mayContinue(),
      truncated: (listing) => {
        cut.add(listing);
        scope.truncated(listing);
      },
    },
  };
}

interface GoogleAccess {
  token: string;
  scope: ReadScope;
}

type SyncOutcome = { kind: "done"; created: number } | { kind: "failed" } | { kind: "lease_lost" };

function courseFailure(code: ClassroomErrorCode): CourseFailure {
  if (code === "CLASSROOM_READ_STOPPED") return "lease_lost";
  if (code === "CLASSROOM_SCOPE_MISSING") return "scope_missing";
  if (SCHOOL_BLOCKS.includes(code)) return "school_block";

  return "transient";
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SyncChildService {
  constructor(
    private readonly classroom: IClassroomClient,
    private readonly tokens: IChildAccessTokens,
    private readonly extractor: IAnnouncementExtractor,
    private readonly events: IEventIngest,
    private readonly syncState: IChildSyncState,
    private readonly ledger: ISeenAnnouncementRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly logger: ILogger,
    private readonly sleep: (ms: number) => Promise<void> = wait,
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

        const scope = this.readScope(lease);
        const listing = trackCuts(scope);
        const courses = await this.withRetry(() =>
          this.classroom.listCourses(token.getValue(), listing.scope),
        );
        if (courses.isFailure) return this.courseListFailed(lease, courses.getError().code, now);

        return this.syncCourses(
          input,
          lease,
          { token: token.getValue(), scope },
          { courses: courses.getValue(), complete: !listing.cut.has("courses") },
          now,
        );
      },
    );
  }

  private async syncCourses(
    input: SyncChildInput,
    lease: SyncLease,
    access: GoogleAccess,
    { courses, complete }: CourseList,
    now: Date,
  ): Promise<Result<SyncReport, SyncError>> {
    const reads = await runPooled(courses, COURSE_CONCURRENCY, (course) =>
      this.readCourse(input.childId, access, course, now),
    );
    const failures = reads.filter((read) => read.isFailure).map((read) => read.getError());
    if (failures.includes("lease_lost")) return Result.fail(leaseLost);
    if (failures.includes("scope_missing"))
      return this.needsReconnect(input.childId, "invalid_grant");
    if (courses.length > 0 && failures.length === courses.length) {
      if (failures.every((failure) => failure === "school_block"))
        return this.needsReconnect(input.childId, "school_blocked");
      return this.failed(lease, now, providerFailure("annonces"));
    }

    const read = reads.flatMap((course) => (course.isSuccess ? [course.getValue()] : []));
    const saved = await runPooled(read, COURSE_CONCURRENCY, (course) =>
      this.saveCoursework(input, lease, course),
    );
    const pending = read.flatMap((course) => course.pending);
    const extracted = await runPooled(pending, EXTRACTION_CONCURRENCY, (item) =>
      this.processAnnouncement(input, lease, item, now),
    );
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

  private async readCourse(
    childId: string,
    { token, scope }: GoogleAccess,
    course: Course,
    now: Date,
  ): Promise<Result<CourseRead, CourseFailure>> {
    if (!(await scope.mayContinue())) return Result.fail("lease_lost");

    const { scope: courseScope, cut } = trackCuts(scope);
    const [listed, coursework, turnedIn] = await Promise.all([
      this.withRetry(() =>
        this.classroom.listAnnouncements(token, course.id, windowStart(now), courseScope),
      ),
      this.withRetry(() => this.classroom.listCoursework(token, course.id, courseScope)),
      this.withRetry(() => this.classroom.listTurnedIn(token, course.id, courseScope)),
    ]);
    const refused = [listed, coursework, turnedIn].find((read) => read.isFailure);
    if (refused?.isFailure) return Result.fail(courseFailure(refused.getError().code));

    const pending = await this.pendingAnnouncements(childId, listed.getValue(), now);
    if (pending.isFailure) return Result.fail(pending.getError());

    return Result.ok({
      courseId: course.id,
      pending: pending.getValue(),
      coursework: this.courseworkDeadlines(coursework.getValue(), turnedIn.getValue(), now),
      courseworkComplete: !cut.has("coursework"),
      presentIds: coursework
        .getValue()
        .filter(({ due }) => due.isSome())
        .map(({ id }) => id),
    });
  }

  private async pendingAnnouncements(
    childId: string,
    listed: Announcement[],
    now: Date,
  ): Promise<Result<PendingAnnouncement[], CourseFailure>> {
    const recent = listed.filter(({ publishedAt }) => isWithinWindow(publishedAt, now));
    if (recent.length === 0) return Result.ok([]);

    const seen = await this.ledger.findForCourse(
      childId,
      recent.map(({ id }) => id),
    );
    if (seen.isFailure) return Result.fail("transient");

    const byId = new Map(seen.getValue().map((entry) => [entry.announcementId, entry]));
    return Result.ok(
      recent
        .map((announcement) => ({
          announcement,
          state: Option.fromNullable<LedgerState>(byId.get(announcement.id)),
        }))
        .filter(({ state }) => needsExtraction(state)),
    );
  }

  private courseworkDeadlines(
    coursework: Coursework[],
    turnedIn: string[],
    now: Date,
  ): CourseworkDeadline[] {
    const done = new Set(turnedIn);
    return coursework.flatMap(({ id, title, url, due }) => {
      if (due.isNone()) return [];

      const deadline = schoolDeadline(due.unwrap().utcDate, due.unwrap().utcTime);
      if (deadline.isFailure) {
        this.instrumentation.capture(deadline.getError(), { metadata: { courseworkId: id } });
        return [];
      }

      const { deadlineDate, deadlineTime } = deadline.getValue();
      if (!isDayWithinWindow(deadlineDate, now)) return [];

      return [
        {
          id,
          title: courseworkTitle(title),
          url,
          deadlineDate,
          ...deadlineTime
            .map((time): Partial<CourseworkDeadline> => ({ deadlineTime: time }))
            .unwrapOr({}),
          done: done.has(id),
        },
      ];
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

  private async processAnnouncement(
    input: SyncChildInput,
    lease: SyncLease,
    { announcement, state }: PendingAnnouncement,
    now: Date,
  ): Promise<SyncOutcome> {
    const attempt = nextAttempt(state);
    const held = await this.leaseStillHeld(lease);
    if (held.isFailure)
      return held.getError().code === leaseLost.code ? { kind: "lease_lost" } : { kind: "failed" };

    const extracted = await this.extractor.extract({
      text: announcement.text,
      publishedAt: announcement.publishedAt,
      childName: input.label,
    });
    if (extracted.isFailure) {
      this.instrumentation.capture(extracted.getError(), { metadata: { childId: input.childId } });
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
    const next = nextSyncAt(now, nextDelayMs(SYNC_JITTER_BASE_MS));
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
    code: ClassroomErrorCode,
    now: Date,
  ): Promise<Result<SyncReport, SyncError>> {
    const failure = courseFailure(code);
    if (failure === "lease_lost") return Result.fail(leaseLost);
    if (failure === "scope_missing") return this.needsReconnect(lease.childId, "invalid_grant");
    if (failure === "school_block") return this.needsReconnect(lease.childId, "school_blocked");

    return this.failed(lease, now, providerFailure("liste des cours"));
  }

  private async leaseStillHeld(lease: SyncLease): Promise<Result<void, SyncError>> {
    const held = await this.syncState.holdsLease(lease);
    if (held.isFailure) {
      this.instrumentation.capture(held.getError(), { metadata: { childId: lease.childId } });
      return Result.fail(providerFailure("état de l'enfant"));
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

  private async withRetry<T>(
    call: () => Promise<Result<T, ClassroomError>>,
  ): Promise<Result<T, ClassroomError>> {
    let result = await call();
    for (
      let retry = 0;
      retry < RATE_LIMIT_RETRIES &&
      result.isFailure &&
      result.getError().code === "CLASSROOM_RATE_LIMITED";
      retry += 1
    ) {
      await this.sleep(RATE_LIMIT_BACKOFF_MS * 2 ** retry);
      result = await call();
    }

    return result;
  }
}

import { type AppError, type IInstrumentation, mapBounded, Result } from "@packages/ddd-kit";
import {
  type ExtractedDeadline,
  type ExtractionRequest,
  type IAnnouncementExtractor,
  isNotCached,
  isReadingPaused,
} from "../ports/announcement-extractor.port";
import type { IChildAccessTokens } from "../ports/child-access-tokens.port";
import type { Announcement, Course, ReadScope } from "../ports/classroom-client.port";
import type {
  ClassroomAccess,
  CourseFailure,
  IClassroomReader,
} from "../ports/classroom-reader.port";
import type { IEventIngest, RereadOutcome } from "../ports/event-ingest.port";
import type { IParentChildren, ParentChild } from "../ports/parent-children.port";
import type { ISeenAnnouncementRepository } from "../ports/seen-announcement-repository.port";
import type { SyncError } from "../sync-error";

const COURSE_CONCURRENCY = 4;
const READING_CONCURRENCY = 4;

export type RereadMode = "dry_run" | "dry_run_with_model" | "apply";

export interface RereadAnnouncementsInput {
  userId: string;
  childId?: string;
  mode: RereadMode;
}

export type ChildRereadStatus = "read" | "reconnect_needed" | "unreachable";

export interface ChildRereadReport {
  childId: string;
  label: string;
  status: ChildRereadStatus;
  courses: number;
  skippedCourses: number;
  announcementsInWindow: number;
  announcementsWithDeadlines: number;
  readWithoutModel: number;
  readByModel: number;
  modelCallsSkipped: number;
  readingPaused: number;
  failures: Record<string, number>;
  deadlines: RereadOutcome;
}

export interface RereadReport {
  mode: RereadMode;
  children: ChildRereadReport[];
}

type Reading =
  | { kind: "read"; source: "cache" | "model"; deadlines: ExtractedDeadline[] }
  | { kind: "model_skipped" }
  | { kind: "paused" }
  | { kind: "failed"; code: string };

type AnnouncementOutcome =
  | Exclude<Reading, { kind: "read" }>
  | {
      kind: "read";
      source: "cache" | "model";
      deadlines: RereadOutcome;
    };

interface ChildScope {
  userId: string;
  child: ParentChild;
  mode: RereadMode;
}

const childNotFound: SyncError = {
  code: "SYNC_CHILD_NOT_FOUND",
  message: "Cet enfant n'est pas relié à ce compte parent.",
};

const operatorScope: ReadScope = { mayContinue: async () => true, truncated: () => {} };

function emptyReport(
  { childId, label }: ParentChild,
  status: ChildRereadStatus,
): ChildRereadReport {
  return {
    childId,
    label,
    status,
    courses: 0,
    skippedCourses: 0,
    announcementsInWindow: 0,
    announcementsWithDeadlines: 0,
    readWithoutModel: 0,
    readByModel: 0,
    modelCallsSkipped: 0,
    readingPaused: 0,
    failures: {},
    deadlines: { matched: 0, changed: 0, unmatched: 0 },
  };
}

function statusOf(
  failure: CourseFailure | "reconnect_needed" | "provider_failure",
): ChildRereadStatus {
  const reconnect: string[] = ["reconnect", "school_block", "reconnect_needed"];
  return reconnect.includes(failure) ? "reconnect_needed" : "unreachable";
}

function tally(report: ChildRereadReport, outcome: AnnouncementOutcome): ChildRereadReport {
  if (outcome.kind === "model_skipped")
    return { ...report, modelCallsSkipped: report.modelCallsSkipped + 1 };
  if (outcome.kind === "paused") return { ...report, readingPaused: report.readingPaused + 1 };
  if (outcome.kind === "failed")
    return {
      ...report,
      failures: { ...report.failures, [outcome.code]: (report.failures[outcome.code] ?? 0) + 1 },
    };

  const { deadlines } = report;
  return {
    ...report,
    readWithoutModel: report.readWithoutModel + (outcome.source === "cache" ? 1 : 0),
    readByModel: report.readByModel + (outcome.source === "model" ? 1 : 0),
    deadlines: {
      matched: deadlines.matched + outcome.deadlines.matched,
      changed: deadlines.changed + outcome.deadlines.changed,
      unmatched: deadlines.unmatched + outcome.deadlines.unmatched,
    },
  };
}

export class RereadAnnouncementsService {
  constructor(
    private readonly children: IParentChildren,
    private readonly tokens: IChildAccessTokens,
    private readonly reader: IClassroomReader,
    private readonly ledger: ISeenAnnouncementRepository,
    private readonly extractor: IAnnouncementExtractor,
    private readonly events: IEventIngest,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async reread(
    input: RereadAnnouncementsInput,
    now: Date,
  ): Promise<Result<RereadReport, SyncError>> {
    return this.instrumentation.startSpan(
      { name: "RereadAnnouncementsService > reread", op: "function" },
      async () => {
        const selected = await this.selectChildren(input);
        if (selected.isFailure) return Result.fail(selected.getError());

        const children: ChildRereadReport[] = [];
        for (const child of selected.getValue())
          children.push(
            await this.rereadChild({ userId: input.userId, child, mode: input.mode }, now),
          );

        return Result.ok({ mode: input.mode, children });
      },
    );
  }

  private async selectChildren(
    input: RereadAnnouncementsInput,
  ): Promise<Result<ParentChild[], SyncError>> {
    const listed = await this.children.childrenOf(input.userId);
    if (listed.isFailure || input.childId === undefined) return listed;

    const selected = listed.getValue().filter(({ childId }) => childId === input.childId);
    if (selected.length === 0) return Result.fail(childNotFound);

    return Result.ok(selected);
  }

  private async rereadChild(scope: ChildScope, now: Date): Promise<ChildRereadReport> {
    const token = await this.tokens.accessTokenFor(scope.child.childId);
    if (token.isFailure) return emptyReport(scope.child, statusOf(token.getError()));

    const access: ClassroomAccess = { token: token.getValue(), scope: operatorScope };
    const courses = await this.reader.listCourses(access);
    if (courses.isFailure) return emptyReport(scope.child, statusOf(courses.getError()));

    const childNames = await this.reader.profileNames(access.token);
    if (childNames.isFailure) {
      this.instrumentation.capture(childNames.getError(), {
        metadata: { childId: scope.child.childId },
      });
      return emptyReport(scope.child, "unreachable");
    }

    const names = [...new Set([scope.child.label, ...childNames.getValue()])];
    return this.rereadCourses(scope, access, courses.getValue().courses, names, now);
  }

  private async rereadCourses(
    scope: ChildScope,
    access: ClassroomAccess,
    courses: Course[],
    childNames: string[],
    now: Date,
  ): Promise<ChildRereadReport> {
    const listed = await mapBounded(courses, COURSE_CONCURRENCY, (course) =>
      this.reader.recentAnnouncements(access, course, now),
    );
    const announcements = listed.flatMap((read) => (read.isSuccess ? read.getValue() : []));
    const withDeadlines = await this.withStoredDeadlines(scope.child.childId, announcements);
    const outcomes = await mapBounded(withDeadlines, READING_CONCURRENCY, (announcement) =>
      this.rereadAnnouncement(scope, announcement, childNames),
    );

    return outcomes.reduce(tally, {
      ...emptyReport(scope.child, "read"),
      courses: courses.length,
      skippedCourses: listed.filter((read) => read.isFailure).length,
      announcementsInWindow: announcements.length,
      announcementsWithDeadlines: withDeadlines.length,
    });
  }

  private async withStoredDeadlines(
    childId: string,
    announcements: Announcement[],
  ): Promise<Announcement[]> {
    if (announcements.length === 0) return [];

    const seen = await this.ledger.findForCourse(
      childId,
      announcements.map(({ id }) => id),
    );
    if (seen.isFailure) {
      this.instrumentation.capture(seen.getError(), { metadata: { childId } });
      return [];
    }

    const extracted = new Set(
      seen
        .getValue()
        .filter(({ outcome }) => outcome === "extracted")
        .map(({ announcementId }) => announcementId),
    );
    return announcements.filter(({ id }) => extracted.has(id));
  }

  private async rereadAnnouncement(
    scope: ChildScope,
    announcement: Announcement,
    childNames: string[],
  ): Promise<AnnouncementOutcome> {
    const reading = await this.read(scope, announcement, childNames);
    if (reading.kind !== "read") return reading;

    const request = {
      userId: scope.userId,
      childId: scope.child.childId,
      announcementId: announcement.id,
      events: reading.deadlines,
    };
    const written =
      scope.mode === "apply"
        ? await this.events.applyReread(request)
        : await this.events.previewReread(request);
    if (written.isFailure) return this.failed(scope, written.getError());

    return { kind: "read", source: reading.source, deadlines: written.getValue() };
  }

  private async read(
    scope: ChildScope,
    announcement: Announcement,
    childNames: string[],
  ): Promise<Reading> {
    const request: ExtractionRequest = {
      userId: scope.userId,
      announcementId: announcement.id,
      text: announcement.text,
      publishedAt: announcement.publishedAt,
      childNames,
    };
    const cached = await this.extractor.extract({ ...request, cacheOnly: true });
    if (cached.isSuccess)
      return { kind: "read", source: "cache", deadlines: cached.getValue().deadlines };
    if (!isNotCached(cached.getError())) return this.refused(scope, cached.getError());
    if (scope.mode === "dry_run") return { kind: "model_skipped" };

    const read = await this.extractor.extract(request);
    if (read.isSuccess)
      return { kind: "read", source: "model", deadlines: read.getValue().deadlines };

    return this.refused(scope, read.getError());
  }

  private refused(scope: ChildScope, error: AppError): Reading {
    if (isReadingPaused(error)) return { kind: "paused" };

    return this.failed(scope, error);
  }

  private failed(scope: ChildScope, error: AppError): { kind: "failed"; code: string } {
    this.instrumentation.capture(error, { metadata: { childId: scope.child.childId } });
    return { kind: "failed", code: error.code };
  }
}

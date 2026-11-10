import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { type LedgerState, needsExtraction } from "../../domain/announcement-ledger";
import { courseworkTitle, schoolDeadline } from "../../domain/coursework-deadline";
import { isDayWithinWindow, isWithinWindow, windowStart } from "../../domain/sync-window";
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
import type {
  ClassroomAccess,
  CourseFailure,
  CourseList,
  CourseRead,
  IClassroomReader,
  PendingAnnouncement,
} from "../ports/classroom-reader.port";
import type { CourseworkDeadline } from "../ports/event-ingest.port";
import type { ISeenAnnouncementRepository } from "../ports/seen-announcement-repository.port";

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BACKOFF_MS = 2_000;

const SCHOOL_BLOCKS: readonly ClassroomErrorCode[] = [
  "CLASSROOM_PERMISSION_DENIED",
  "CLASSROOM_ACCESS_NOT_CONFIGURED",
];

const RECONNECT_NEEDED: readonly ClassroomErrorCode[] = [
  "CLASSROOM_UNAUTHORIZED",
  "CLASSROOM_SCOPE_MISSING",
];

function courseFailure(code: ClassroomErrorCode): CourseFailure {
  if (code === "CLASSROOM_READ_STOPPED") return "lease_lost";
  if (RECONNECT_NEEDED.includes(code)) return "reconnect";
  if (SCHOOL_BLOCKS.includes(code)) return "school_block";
  if (code === "CLASSROOM_SERVICE_DISABLED") return "misconfigured";

  return "transient";
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

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ClassroomReader implements IClassroomReader {
  constructor(
    private readonly classroom: IClassroomClient,
    private readonly ledger: ISeenAnnouncementRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly sleep: (ms: number) => Promise<void> = wait,
  ) {}

  async listCourses({ token, scope }: ClassroomAccess): Promise<Result<CourseList, CourseFailure>> {
    return this.span("listCourses", async () => {
      const listing = trackCuts(scope);
      const courses = await this.withRetry(() => this.classroom.listCourses(token, listing.scope));
      if (courses.isFailure) return Result.fail(courseFailure(courses.getError().code));

      return Result.ok({ courses: courses.getValue(), complete: !listing.cut.has("courses") });
    });
  }

  async readCourse(
    childId: string,
    { token, scope }: ClassroomAccess,
    course: Course,
    now: Date,
  ): Promise<Result<CourseRead, CourseFailure>> {
    return this.span("readCourse", async () => {
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
    });
  }

  async profileNames(token: string): Promise<Result<string[], ClassroomError>> {
    return this.span("profileNames", () =>
      this.withRetry(() => this.classroom.profileNames(token)),
    );
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `ClassroomReader > ${method}`, op: "function" },
      work,
    );
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

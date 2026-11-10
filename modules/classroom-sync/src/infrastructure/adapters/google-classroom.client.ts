import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { instrumentedFetch } from "@packages/http/instrumented-fetch";
import { z } from "zod";
import type {
  Announcement,
  ClassroomError,
  ClassroomErrorCode,
  Course,
  Coursework,
  IClassroomClient,
} from "../../application/ports/classroom-client.port";

const API_URL = "https://classroom.googleapis.com/v1";
const TIMEOUT_MS = 15_000;
const COURSE_PAGE_SIZE = "100";
const ANNOUNCEMENT_PAGE_SIZE = "50";
const COURSEWORK_PAGE_SIZE = "100";
const MAX_PAGES = 20;
const ACCESS_NOT_CONFIGURED = "accessNotConfigured";
const CLASSROOM_DISABLED = "@ClassroomApiDisabled";
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded"]);

const coursesPage = z.object({
  courses: z.array(z.object({ id: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});

const announcementsPage = z.object({
  announcements: z
    .array(
      z.object({
        id: z.string().min(1),
        courseId: z.string().min(1),
        text: z.string().optional(),
        creationTime: z.iso.datetime({ offset: true }),
        updateTime: z.iso.datetime({ offset: true }),
        alternateLink: z.string(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

const courseworkPage = z.object({
  courseWork: z
    .array(
      z.object({
        id: z.string().min(1),
        courseId: z.string().min(1),
        title: z.string(),
        alternateLink: z.string(),
        dueDate: z
          .object({
            year: z.number().int().min(1),
            month: z.number().int().min(1).max(12),
            day: z.number().int().min(1).max(31),
          })
          .optional(),
        dueTime: z
          .object({
            hours: z.number().int().min(0).max(23).optional(),
            minutes: z.number().int().min(0).max(59).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

const submissionsPage = z.object({
  studentSubmissions: z.array(z.object({ courseWorkId: z.string().min(1) })).optional(),
  nextPageToken: z.string().optional(),
});

type CourseworkRow = NonNullable<z.infer<typeof courseworkPage>["courseWork"]>[number];

type Query = Record<string, string | string[]>;

const coursePath = (courseId: string) => `/courses/${encodeURIComponent(courseId)}`;

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

function toCoursework(row: CourseworkRow): Coursework {
  const { dueDate, dueTime } = row;

  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    url: row.alternateLink,
    due: Option.fromNullable(dueDate).map(({ year, month, day }) => ({
      utcDate: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
      utcTime: Option.fromNullable(dueTime).map(
        ({ hours, minutes }) => `${pad(hours ?? 0)}:${pad(minutes ?? 0)}`,
      ),
    })),
  };
}

const googleError = z.object({
  error: z.object({
    message: z.string().optional(),
    status: z.string().optional(),
    errors: z.array(z.object({ reason: z.string().optional() })).optional(),
    details: z.array(z.object({ reason: z.string().optional() })).optional(),
  }),
});

const MESSAGES: Record<ClassroomErrorCode, string> = {
  CLASSROOM_UNAUTHORIZED: "Google a refusé le jeton d'accès Classroom.",
  CLASSROOM_PERMISSION_DENIED: "Classroom refuse la lecture de ce cours.",
  CLASSROOM_ACCESS_NOT_CONFIGURED: "L'école n'autorise pas cette application à lire Classroom.",
  CLASSROOM_RATE_LIMITED: "Classroom limite le nombre de lectures, nouvel essai plus tard.",
  CLASSROOM_PROVIDER_FAILURE: "Classroom n'a pas répondu correctement.",
};

const failure = <T>(code: ClassroomErrorCode) =>
  Result.fail<T, ClassroomError>({ code, message: MESSAGES[code] });

async function jsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function refusalCode(status: number, body: unknown): ClassroomErrorCode {
  const parsed = googleError.safeParse(body);
  const error = parsed.success ? parsed.data.error : {};
  const reasons = [...(error.errors ?? []), ...(error.details ?? [])].map(({ reason }) => reason);

  if (
    reasons.includes(ACCESS_NOT_CONFIGURED) ||
    (error.message ?? "").startsWith(CLASSROOM_DISABLED)
  )
    return "CLASSROOM_ACCESS_NOT_CONFIGURED";
  if (status === 429 || reasons.some((reason) => RATE_LIMIT_REASONS.has(reason ?? "")))
    return "CLASSROOM_RATE_LIMITED";
  if (status === 401) return "CLASSROOM_UNAUTHORIZED";
  if (status === 403) return "CLASSROOM_PERMISSION_DENIED";

  return "CLASSROOM_PROVIDER_FAILURE";
}

export class GoogleClassroomClient implements IClassroomClient {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async listCourses(accessToken: string): Promise<Result<Course[], ClassroomError>> {
    return this.instrumentation.startSpan({ name: "GoogleClassroomClient > listCourses" }, () =>
      this.collect(
        accessToken,
        "/courses",
        coursesPage,
        { studentId: "me", courseStates: "ACTIVE", pageSize: COURSE_PAGE_SIZE },
        (body) => ({ rows: (body.courses ?? []).map(({ id }) => ({ id })), more: true }),
      ),
    );
  }

  async listAnnouncements(
    accessToken: string,
    courseId: string,
    since: Date,
  ): Promise<Result<Announcement[], ClassroomError>> {
    return this.instrumentation.startSpan(
      { name: "GoogleClassroomClient > listAnnouncements" },
      () =>
        this.collect(
          accessToken,
          `${coursePath(courseId)}/announcements`,
          announcementsPage,
          { orderBy: "updateTime desc", pageSize: ANNOUNCEMENT_PAGE_SIZE },
          (body) => {
            const posts = body.announcements ?? [];
            const recent = posts.filter((post) => new Date(post.updateTime) >= since);
            return {
              rows: recent.map((post) => ({
                id: post.id,
                courseId: post.courseId,
                text: post.text ?? "",
                publishedAt: new Date(post.creationTime),
                url: post.alternateLink,
              })),
              more: recent.length === posts.length,
            };
          },
        ),
    );
  }

  async listCoursework(
    accessToken: string,
    courseId: string,
  ): Promise<Result<Coursework[], ClassroomError>> {
    return this.instrumentation.startSpan({ name: "GoogleClassroomClient > listCoursework" }, () =>
      this.collect(
        accessToken,
        `${coursePath(courseId)}/courseWork`,
        courseworkPage,
        { courseWorkStates: "PUBLISHED", pageSize: COURSEWORK_PAGE_SIZE },
        (body) => ({ rows: (body.courseWork ?? []).map(toCoursework), more: true }),
      ),
    );
  }

  async listTurnedIn(
    accessToken: string,
    courseId: string,
  ): Promise<Result<string[], ClassroomError>> {
    return this.instrumentation.startSpan({ name: "GoogleClassroomClient > listTurnedIn" }, () =>
      this.collect(
        accessToken,
        `${coursePath(courseId)}/courseWork/-/studentSubmissions`,
        submissionsPage,
        { userId: "me", states: ["TURNED_IN", "RETURNED"], pageSize: COURSEWORK_PAGE_SIZE },
        (body) => ({
          rows: (body.studentSubmissions ?? []).map(({ courseWorkId }) => courseWorkId),
          more: true,
        }),
      ),
    );
  }

  private async collect<P extends { nextPageToken?: string }, R>(
    accessToken: string,
    path: string,
    schema: z.ZodType<P>,
    query: Query,
    take: (body: P) => { rows: R[]; more: boolean },
  ): Promise<Result<R[], ClassroomError>> {
    const rows: R[] = [];
    let pageToken = "";
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const read = await this.page(accessToken, path, schema, { ...query, pageToken });
      if (read.isFailure) return Result.fail(read.getError());

      const body = read.getValue();
      const taken = take(body);
      rows.push(...taken.rows);
      if (!body.nextPageToken || !taken.more) break;
      pageToken = body.nextPageToken;
    }
    return Result.ok(rows);
  }

  private async page<T>(
    accessToken: string,
    path: string,
    schema: z.ZodType<T>,
    query: Query,
  ): Promise<Result<T, ClassroomError>> {
    const url = new URL(`${API_URL}${path}`);
    for (const [key, value] of Object.entries(query)) {
      for (const item of [value].flat()) {
        if (item !== "") url.searchParams.append(key, item);
      }
    }

    try {
      const response = await instrumentedFetch(this.instrumentation, this.fetchImpl, url.href, {
        method: "GET",
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await jsonBody(response);
      if (!response.ok) {
        const code = refusalCode(response.status, body);
        if (code === "CLASSROOM_PROVIDER_FAILURE")
          this.instrumentation.capture(new Error(`google classroom answered ${response.status}`));
        return failure(code);
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        this.instrumentation.capture(parsed.error);
        return failure("CLASSROOM_PROVIDER_FAILURE");
      }

      return Result.ok(parsed.data);
    } catch (err) {
      this.instrumentation.capture(err);
      return failure("CLASSROOM_PROVIDER_FAILURE");
    }
  }
}

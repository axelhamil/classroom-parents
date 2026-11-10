import { beforeEach, describe, expect, it } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { ClassroomListing, ReadScope } from "../application/ports/classroom-client.port";
import { GoogleClassroomClient } from "../infrastructure/adapters/google-classroom.client";

const SINCE = new Date("2026-09-10T00:00:00.000Z");

let requests: URL[];
let answers: Response[];
let client: GoogleClassroomClient;
let truncated: ClassroomListing[];
let open: ReadScope;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function googleError(status: number, error: Record<string, unknown>): Response {
  return json(status, { error: { code: status, message: "refused", ...error } });
}

function post(id: string, updateTime: string) {
  return {
    id,
    courseId: "c1",
    text: `Annonce ${id}`,
    creationTime: updateTime,
    updateTime,
    alternateLink: `https://classroom.google.com/c/c1/p/${id}`,
    state: "PUBLISHED",
  };
}

beforeEach(() => {
  requests = [];
  answers = [];
  truncated = [];
  open = {
    mayContinue: async () => true,
    truncated: (listing) => {
      truncated.push(listing);
    },
  };
  const fakeFetch = async (input: string | URL | Request) => {
    requests.push(new URL(String(input)));
    return answers.shift() ?? json(500, {});
  };
  client = new GoogleClassroomClient(
    mockInstrumentation(),
    Object.assign(fakeFetch, { preconnect: fetch.preconnect }),
  );
});

describe("GoogleClassroomClient", () => {
  it("lists the active courses the child follows as a student", async () => {
    answers.push(json(200, { courses: [{ id: "c1", name: "Maths" }, { id: "c2" }] }));

    const result = await client.listCourses("ya29.token", open);

    expect(result.getValue()).toEqual([{ id: "c1" }, { id: "c2" }]);
    expect(requests[0]?.searchParams.get("studentId")).toBe("me");
    expect(requests[0]?.searchParams.get("courseStates")).toBe("ACTIVE");
  });

  it("returns the announcements of both result pages", async () => {
    answers.push(
      json(200, {
        announcements: [post("a1", "2026-11-08T10:00:00Z"), post("a2", "2026-11-01T10:00:00Z")],
        nextPageToken: "page-2",
      }),
      json(200, { announcements: [post("a3", "2026-10-20T10:00:00Z")] }),
    );

    const result = await client.listAnnouncements("ya29.token", "c1", SINCE, open);

    expect(result.getValue().map(({ id }) => id)).toEqual(["a1", "a2", "a3"]);
    expect(result.getValue()[0]).toEqual({
      id: "a1",
      courseId: "c1",
      text: "Annonce a1",
      publishedAt: new Date("2026-11-08T10:00:00Z"),
      url: "https://classroom.google.com/c/c1/p/a1",
    });
    expect(requests[0]?.searchParams.get("orderBy")).toBe("updateTime desc");
    expect(requests[1]?.searchParams.get("pageToken")).toBe("page-2");
  });

  it("stops paging once the announcements are older than the window", async () => {
    answers.push(
      json(200, {
        announcements: [post("a1", "2026-11-08T10:00:00Z"), post("old", "2026-08-01T10:00:00Z")],
        nextPageToken: "page-2",
      }),
    );

    const result = await client.listAnnouncements("ya29.token", "c1", SINCE, open);

    expect(result.getValue().map(({ id }) => id)).toEqual(["a1"]);
    expect(requests).toHaveLength(1);
  });

  it("maps a 403 PERMISSION_DENIED to CLASSROOM_PERMISSION_DENIED", async () => {
    answers.push(googleError(403, { status: "PERMISSION_DENIED" }));

    const result = await client.listAnnouncements("ya29.token", "c1", SINCE, open);

    expect(result.getError().code).toBe("CLASSROOM_PERMISSION_DENIED");
  });

  it("maps a 403 for an insufficient token scope to CLASSROOM_SCOPE_MISSING", async () => {
    answers.push(
      googleError(403, {
        status: "PERMISSION_DENIED",
        message: "Request had insufficient authentication scopes.",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
          },
        ],
      }),
    );

    const result = await client.listCoursework("ya29.token", "c1", open);

    expect(result.getError().code).toBe("CLASSROOM_SCOPE_MISSING");
  });

  it("maps a 401 to CLASSROOM_UNAUTHORIZED", async () => {
    answers.push(googleError(401, { status: "UNAUTHENTICATED" }));

    const result = await client.listCourses("ya29.token", open);

    expect(result.getError().code).toBe("CLASSROOM_UNAUTHORIZED");
  });

  it("maps the accessNotConfigured reason to CLASSROOM_ACCESS_NOT_CONFIGURED", async () => {
    answers.push(
      googleError(403, {
        status: "PERMISSION_DENIED",
        errors: [{ reason: "accessNotConfigured", domain: "usageLimits" }],
      }),
    );

    const result = await client.listCourses("ya29.token", open);

    expect(result.getError().code).toBe("CLASSROOM_ACCESS_NOT_CONFIGURED");
  });

  it("maps a 429 to CLASSROOM_RATE_LIMITED", async () => {
    answers.push(googleError(429, { status: "RESOURCE_EXHAUSTED" }));

    const result = await client.listCourses("ya29.token", open);

    expect(result.getError().code).toBe("CLASSROOM_RATE_LIMITED");
  });

  it("maps a server error or an unreadable body to CLASSROOM_PROVIDER_FAILURE", async () => {
    answers.push(json(503, {}), json(200, { courses: "nope" }));

    const down = await client.listCourses("ya29.token", open);
    const garbled = await client.listCourses("ya29.token", open);

    expect(down.getError().code).toBe("CLASSROOM_PROVIDER_FAILURE");
    expect(garbled.getError().code).toBe("CLASSROOM_PROVIDER_FAILURE");
  });

  it("lists the published coursework with its due date and time in UTC", async () => {
    answers.push(
      json(200, {
        courseWork: [
          {
            id: "w1",
            courseId: "c1",
            title: "Exercices p. 42",
            alternateLink: "https://classroom.google.com/c/c1/a/w1",
            dueDate: { year: 2026, month: 11, day: 9 },
            dueTime: { hours: 22, minutes: 5 },
          },
          {
            id: "w2",
            courseId: "c1",
            title: "Exposé",
            alternateLink: "https://classroom.google.com/c/c1/a/w2",
            dueDate: { year: 2026, month: 11, day: 20 },
            dueTime: {},
          },
          {
            id: "w3",
            courseId: "c1",
            title: "Lecture",
            alternateLink: "https://classroom.google.com/c/c1/a/w3",
            dueDate: { year: 2026, month: 12, day: 1 },
          },
          {
            id: "w4",
            courseId: "c1",
            title: "Sans date",
            alternateLink: "https://classroom.google.com/c/c1/a/w4",
          },
        ],
      }),
    );

    const result = await client.listCoursework("ya29.token", "c1", open);

    const dues = result
      .getValue()
      .map(({ id, due }) => [
        id,
        due.map(({ utcDate, utcTime }) => `${utcDate} ${utcTime.unwrapOr("-")}`).unwrapOr("none"),
      ]);
    expect(dues).toEqual([
      ["w1", "2026-11-09 22:05"],
      ["w2", "2026-11-20 00:00"],
      ["w3", "2026-12-01 -"],
      ["w4", "none"],
    ]);
    expect(result.getValue()[0]?.title).toBe("Exercices p. 42");
    expect(requests[0]?.pathname).toBe("/v1/courses/c1/courseWork");
    expect(requests[0]?.searchParams.get("courseWorkStates")).toBe("PUBLISHED");
  });

  it("lists the child's turned-in or returned coursework of a course", async () => {
    answers.push(
      json(200, {
        studentSubmissions: [{ courseWorkId: "w1" }, { courseWorkId: "w2" }],
      }),
    );

    const result = await client.listTurnedIn("ya29.token", "c1", open);

    expect(result.getValue()).toEqual(["w1", "w2"]);
    expect(requests[0]?.pathname).toBe("/v1/courses/c1/courseWork/-/studentSubmissions");
    expect(requests[0]?.searchParams.get("userId")).toBe("me");
    expect(requests[0]?.searchParams.getAll("states")).toEqual(["TURNED_IN", "RETURNED"]);
  });

  it("stops before the next page once the scope may not continue", async () => {
    let pages = 0;
    const closing: ReadScope = {
      mayContinue: async () => pages++ < 1,
      truncated: () => {},
    };
    answers.push(json(200, { studentSubmissions: [{ courseWorkId: "w1" }], nextPageToken: "p2" }));

    const result = await client.listTurnedIn("ya29.token", "c1", closing);

    expect(result.getError().code).toBe("CLASSROOM_READ_STOPPED");
    expect(requests).toHaveLength(1);
  });

  it("calls Google not at all when the scope is already closed", async () => {
    const closed: ReadScope = { mayContinue: async () => false, truncated: () => {} };

    const result = await client.listCourses("ya29.token", closed);

    expect(result.getError().code).toBe("CLASSROOM_READ_STOPPED");
    expect(requests).toHaveLength(0);
  });

  it("reports a listing cut at the page cap and keeps the pages read", async () => {
    for (let page = 0; page < 25; page += 1)
      answers.push(
        json(200, { studentSubmissions: [{ courseWorkId: `w${page}` }], nextPageToken: "more" }),
      );

    const result = await client.listTurnedIn("ya29.token", "c1", open);

    expect(result.getValue()).toHaveLength(20);
    expect(requests).toHaveLength(20);
    expect(truncated).toEqual(["submissions"]);
  });

  it("reports nothing when the last page has no next token", async () => {
    answers.push(json(200, { studentSubmissions: [{ courseWorkId: "w1" }] }));

    await client.listTurnedIn("ya29.token", "c1", open);

    expect(truncated).toEqual([]);
  });
});

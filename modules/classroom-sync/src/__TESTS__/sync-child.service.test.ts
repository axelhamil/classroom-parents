import { beforeEach, describe, expect, it } from "bun:test";
import { type AppError, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import type { ExtractedDeadline } from "../application/ports/announcement-extractor.port";
import type {
  Announcement,
  ClassroomError,
  Course,
  Coursework,
} from "../application/ports/classroom-client.port";
import type { SeenAnnouncement } from "../application/ports/seen-announcement-repository.port";
import type { SyncError } from "../application/sync-error";
import {
  announcement,
  CHILD,
  classroomFailure,
  coursework,
  DAY_MS,
  deadline,
  NOW,
  type SyncHarness,
  syncHarness,
} from "./sync-harness";

const MINUTE_MS = 60_000;

let h: SyncHarness;

beforeEach(() => {
  h = syncHarness();
});

type ExtractorAnswer = ExtractedDeadline[] | "invalid" | "down" | "rate_limited";

const EXTRACTOR_FAILURES = {
  invalid: "EXTRACTION_OUTPUT_INVALID",
  down: "EXTRACTION_PROVIDER_FAILURE",
  rate_limited: "EXTRACTION_RATE_LIMITED",
} as const;

function extractorAnswers(byText: Record<string, ExtractorAnswer>): void {
  h.extractor.extract.mockImplementation(async ({ text }) => {
    const answer = byText[text] ?? [];
    if (typeof answer === "string")
      return Result.fail<ExtractedDeadline[], AppError>({
        code: EXTRACTOR_FAILURES[answer],
        message: answer,
      });
    return Result.ok<ExtractedDeadline[], AppError>(answer);
  });
}

function ledgerHas(entries: SeenAnnouncement[]): void {
  h.ledger.findForCourse.mockResolvedValue(Result.ok<SeenAnnouncement[], SyncError>(entries));
}

const outcomes = () =>
  Object.fromEntries(
    h
      .recorded()
      .map(({ announcementId, outcome, attempts }) => [announcementId, { outcome, attempts }]),
  );

describe("syncChild", () => {
  it("extracts new announcements, ingests those with events and reports the counts", async () => {
    h.givenCourses({
      maths: [announcement("a1", "maths"), announcement("a2", "maths")],
      french: [announcement("a3", "french")],
    });
    extractorAnswers({
      "Annonce a1": [deadline("Contrôle")],
      "Annonce a3": [deadline("Exposé"), deadline("Sortie")],
    });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getValue()).toEqual({
      courses: 2,
      skippedCourses: 0,
      newAnnouncements: 3,
      eventsCreated: 3,
      failedAnnouncements: 0,
      failedCoursework: 0,
    });
    expect(h.ingest.ingest.mock.calls.map(([request]) => request.announcement.id).sort()).toEqual([
      "a1",
      "a3",
    ]);
    expect(h.ingest.ingest.mock.calls.find(([r]) => r.announcement.id === "a1")?.[0]).toEqual({
      userId: CHILD.userId,
      childId: CHILD.childId,
      announcement: {
        id: "a1",
        courseId: "maths",
        url: "https://classroom.google.com/c/maths/p/a1",
        publishedAt: new Date(NOW.getTime() - 2 * DAY_MS),
      },
      events: [deadline("Contrôle")],
    });
    expect(outcomes()).toEqual({
      a1: { outcome: "extracted", attempts: 1 },
      a2: { outcome: "no_event", attempts: 1 },
      a3: { outcome: "extracted", attempts: 1 },
    });
    expect(enqueuedEvents(h.outbox)).toEqual([
      {
        eventType: EventTypes.ANNOUNCEMENT_SYNCED,
        aggregateId: CHILD.childId,
        payload: {
          userId: CHILD.userId,
          childId: CHILD.childId,
          newAnnouncements: 3,
          eventsCreated: 3,
          actorUserId: null,
        },
      },
    ]);
  });

  it("hands the label and the real Google names of the child to the extractor so all are masked", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths"), announcement("a2", "maths")] });
    h.client.profileNames.mockResolvedValue(
      Result.ok<string[], ClassroomError>(["Inès Martin", "Inès"]),
    );

    await h.service.syncChild({ ...CHILD, label: "Lili" }, NOW);

    expect(h.client.profileNames).toHaveBeenCalledTimes(1);
    expect(h.extractor.extract.mock.calls[0]?.[0]).toEqual({
      text: "Annonce a1",
      publishedAt: new Date(NOW.getTime() - 2 * DAY_MS),
      childNames: ["Lili", "Inès Martin", "Inès"],
    });
  });

  it("reads no Google profile when no announcement needs the model", async () => {
    h.givenCourses({ maths: [] });

    await h.service.syncChild(CHILD, NOW);

    expect(h.client.profileNames).not.toHaveBeenCalled();
  });

  it("sends nothing to the model and spends no attempt when the child's real names cannot be read", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    h.client.profileNames.mockResolvedValue(
      classroomFailure<string[]>("CLASSROOM_PROVIDER_FAILURE"),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(h.extractor.extract).not.toHaveBeenCalled();
    expect(h.recorded()).toEqual([]);
    expect(result.getValue().failedAnnouncements).toBe(1);
  });

  it("never extracts an announcement already in the ledger, even edited upstream", async () => {
    h.givenCourses({
      maths: [
        announcement("a1", "maths"),
        { ...announcement("a2", "maths"), text: "Texte modifié par le professeur" },
      ],
    });
    ledgerHas([
      { announcementId: "a1", outcome: "extracted", attempts: 1 },
      { announcementId: "a2", outcome: "no_event", attempts: 1 },
    ]);

    const result = await h.service.syncChild(CHILD, NOW);

    expect(h.extractor.extract).not.toHaveBeenCalled();
    expect(h.ingest.ingest).not.toHaveBeenCalled();
    expect(result.getValue().newAnnouncements).toBe(0);
  });

  it("checks the ledger with one lookup per course", async () => {
    h.givenCourses({
      maths: [announcement("a1", "maths"), announcement("a2", "maths")],
      french: [announcement("a3", "french")],
    });

    await h.service.syncChild(CHILD, NOW);

    const lookups = h.ledger.findForCourse.mock.calls.map(([, ids]) => [...ids].sort().join(","));
    expect(lookups.sort()).toEqual(["a1,a2", "a3"]);
  });

  it("records a failed extraction and keeps processing the others", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths"), announcement("a2", "maths")] });
    extractorAnswers({ "Annonce a1": "invalid", "Annonce a2": [deadline("Contrôle")] });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(outcomes()).toEqual({
      a1: { outcome: "failed", attempts: 1 },
      a2: { outcome: "extracted", attempts: 1 },
    });
    expect(result.getValue().failedAnnouncements).toBe(1);
    expect(result.getValue().eventsCreated).toBe(1);
    expect(h.state.markSynced).toHaveBeenCalledTimes(1);
  });

  it("retries a failed announcement and abandons it at the third failure", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    ledgerHas([{ announcementId: "a1", outcome: "failed", attempts: 2 }]);
    extractorAnswers({ "Annonce a1": "invalid" });

    await h.service.syncChild(CHILD, NOW);

    expect(outcomes()).toEqual({ a1: { outcome: "abandoned", attempts: 3 } });
  });

  for (const outage of ["down", "rate_limited"] as const) {
    it(`spends no attempt when the model is ${outage}, the announcement waits for the next sync`, async () => {
      h.givenCourses({ maths: [announcement("a1", "maths"), announcement("a2", "maths")] });
      ledgerHas([{ announcementId: "a1", outcome: "failed", attempts: 2 }]);
      extractorAnswers({ "Annonce a1": outage, "Annonce a2": outage });

      for (let sync = 0; sync < 3; sync += 1) await h.service.syncChild(CHILD, NOW);

      expect(h.recorded()).toEqual([]);
      expect(h.extractor.extract).toHaveBeenCalledTimes(6);
      expect(h.state.markSynced).toHaveBeenCalledTimes(3);
    });
  }

  it("never extracts an abandoned announcement again", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    ledgerHas([{ announcementId: "a1", outcome: "abandoned", attempts: 3 }]);

    await h.service.syncChild(CHILD, NOW);

    expect(h.extractor.extract).not.toHaveBeenCalled();
  });

  it("counts a failed ingest as a failed attempt so it cannot loop forever", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    extractorAnswers({ "Annonce a1": [deadline("Contrôle")] });
    h.ingest.ingest.mockResolvedValue(
      Result.fail<{ created: number }, AppError>({
        code: "EVENT_PROVIDER_FAILURE",
        message: "agenda down",
      }),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(outcomes()).toEqual({ a1: { outcome: "failed", attempts: 1 } });
    expect(result.getValue().failedAnnouncements).toBe(1);
  });

  it("skips the ingest when a concurrent sync already recorded the announcement", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    extractorAnswers({ "Annonce a1": [deadline("Contrôle")] });
    h.ledger.record.mockResolvedValue(Result.ok<boolean, SyncError>(false));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(h.ingest.ingest).not.toHaveBeenCalled();
    expect(result.getValue().eventsCreated).toBe(0);
  });

  it("ignores an announcement published 90 days ago", async () => {
    h.givenCourses({ maths: [announcement("old", "maths", 90), announcement("a1", "maths")] });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(h.extractor.extract.mock.calls.map(([request]) => request.text)).toEqual(["Annonce a1"]);
    expect(result.getValue().newAnnouncements).toBe(1);
  });

  it("asks Google for the last 60 days only", async () => {
    h.givenCourses({ maths: [] });

    await h.service.syncChild(CHILD, NOW);

    expect(h.client.listAnnouncements.mock.calls[0]?.[2]).toEqual(
      new Date(NOW.getTime() - 60 * DAY_MS),
    );
  });

  it("skips a course the child may not read and syncs the others", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")], art: [] });
    h.client.listAnnouncements.mockImplementation(async (_token, courseId) =>
      courseId === "art"
        ? classroomFailure<Announcement[]>("CLASSROOM_PERMISSION_DENIED")
        : Result.ok<Announcement[], ClassroomError>([announcement("a1", "maths")]),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getValue().skippedCourses).toBe(1);
    expect(result.getValue().newAnnouncements).toBe(1);
    expect(h.state.markNeedsReconnect).not.toHaveBeenCalled();
  });

  for (const code of ["CLASSROOM_PERMISSION_DENIED", "CLASSROOM_ACCESS_NOT_CONFIGURED"] as const) {
    it(`marks the child blocked by the school when the course list answers ${code}`, async () => {
      h.client.listCourses.mockResolvedValue(classroomFailure<Course[]>(code));

      const result = await h.service.syncChild(CHILD, NOW);

      expect(result.getError().code).toBe("SYNC_BLOCKED");
      expect(h.state.markNeedsReconnect).toHaveBeenCalledWith(CHILD.childId, "school_blocked");
      expect(h.ingest.ingest).not.toHaveBeenCalled();
      expect(h.state.markSynced).not.toHaveBeenCalled();
      expect(h.state.markSyncFailed).not.toHaveBeenCalled();
    });

    it(`marks the child blocked by the school when every course answers ${code}`, async () => {
      h.givenCourses({ maths: [], art: [] });
      h.client.listAnnouncements.mockResolvedValue(classroomFailure<Announcement[]>(code));

      const result = await h.service.syncChild(CHILD, NOW);

      expect(result.getError().code).toBe("SYNC_BLOCKED");
      expect(h.state.markNeedsReconnect).toHaveBeenCalledWith(CHILD.childId, "school_blocked");
      expect(h.ingest.ingest).not.toHaveBeenCalled();
      expect(h.state.markSynced).not.toHaveBeenCalled();
    });
  }

  it("asks for a reconnection, not the school, when a coursework read lacks the scope", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")], art: [] });
    h.client.listCoursework.mockResolvedValue(
      classroomFailure<Coursework[]>("CLASSROOM_SCOPE_MISSING"),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_BLOCKED");
    expect(h.state.markNeedsReconnect.mock.calls).toEqual([[CHILD.childId, "invalid_grant"]]);
    expect(h.extractor.extract).not.toHaveBeenCalled();
    expect(h.state.markSynced).not.toHaveBeenCalled();
  });

  it("asks for a reconnection, never the school, when Google refuses the token with a 401", async () => {
    h.client.listCourses.mockResolvedValue(classroomFailure<Course[]>("CLASSROOM_UNAUTHORIZED"));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_BLOCKED");
    expect(h.state.markNeedsReconnect.mock.calls).toEqual([[CHILD.childId, "invalid_grant"]]);
  });

  it("asks for a reconnection when every course answers 401", async () => {
    h.givenCourses({ maths: [], art: [] });
    h.client.listAnnouncements.mockResolvedValue(
      classroomFailure<Announcement[]>("CLASSROOM_UNAUTHORIZED"),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_BLOCKED");
    expect(h.state.markNeedsReconnect.mock.calls).toEqual([[CHILD.childId, "invalid_grant"]]);
  });

  it("leaves the child connected and retries later when the app's Google project has Classroom disabled", async () => {
    h.client.listCourses.mockResolvedValue(
      classroomFailure<Course[]>("CLASSROOM_SERVICE_DISABLED"),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_PROVIDER_FAILURE");
    expect(h.state.markNeedsReconnect).not.toHaveBeenCalled();
    expect(h.state.markSyncFailed).toHaveBeenCalledWith(
      { childId: CHILD.childId, lease: CHILD.lease },
      new Date(NOW.getTime() + 10 * MINUTE_MS),
    );
    expect(h.logger.error).toHaveBeenCalledWith(
      { childId: CHILD.childId, code: "CLASSROOM_SERVICE_DISABLED" },
      expect.any(String),
    );
    expect(h.instrumentation.capture).toHaveBeenCalled();
  });

  it("never sends a child to the school screen when only the app's Google project is at fault", async () => {
    h.givenCourses({ maths: [], art: [] });
    h.client.listAnnouncements.mockResolvedValue(
      classroomFailure<Announcement[]>("CLASSROOM_SERVICE_DISABLED"),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_PROVIDER_FAILURE");
    expect(h.state.markNeedsReconnect).not.toHaveBeenCalled();
    expect(h.logger.error).toHaveBeenCalled();
  });

  it("asks for a reconnection when the course list lacks the scope", async () => {
    h.client.listCourses.mockResolvedValue(classroomFailure<Course[]>("CLASSROOM_SCOPE_MISSING"));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_BLOCKED");
    expect(h.state.markNeedsReconnect.mock.calls).toEqual([[CHILD.childId, "invalid_grant"]]);
  });

  it("asks for a reconnection without calling Google when the token is refused", async () => {
    h.tokens.accessTokenFor.mockResolvedValue(Result.fail("reconnect_needed"));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_BLOCKED");
    expect(h.state.markNeedsReconnect).toHaveBeenCalledWith(CHILD.childId, "invalid_grant");
    expect(h.client.listCourses).not.toHaveBeenCalled();
    expect(h.state.markSynced).not.toHaveBeenCalled();
  });

  it("retries a rate-limited call 3 times with a growing backoff, then fails the sync", async () => {
    h.client.listCourses.mockResolvedValue(classroomFailure<Course[]>("CLASSROOM_RATE_LIMITED"));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(h.client.listCourses).toHaveBeenCalledTimes(4);
    expect(h.sleeps).toHaveLength(3);
    expect(h.sleeps[1]).toBeGreaterThan(h.sleeps[0] ?? Number.POSITIVE_INFINITY);
    expect(h.sleeps[2]).toBeGreaterThan(h.sleeps[1] ?? Number.POSITIVE_INFINITY);
    expect(result.getError().code).toBe("SYNC_PROVIDER_FAILURE");
    expect(h.state.markSyncFailed).toHaveBeenCalledWith(
      { childId: CHILD.childId, lease: CHILD.lease },
      new Date(NOW.getTime() + 10 * MINUTE_MS),
    );
    expect(h.state.markSynced).not.toHaveBeenCalled();
  });

  it("goes on once a rate-limited call succeeds on retry", async () => {
    h.client.listCourses
      .mockResolvedValueOnce(classroomFailure<Course[]>("CLASSROOM_RATE_LIMITED"))
      .mockResolvedValueOnce(Result.ok<Course[], ClassroomError>([]));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.isSuccess).toBe(true);
    expect(h.sleeps).toHaveLength(1);
  });

  it("retries in 10 minutes when every course fails for a transient reason", async () => {
    h.givenCourses({ maths: [], art: [] });
    h.client.listAnnouncements.mockResolvedValue(
      classroomFailure<Announcement[]>("CLASSROOM_PROVIDER_FAILURE"),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_PROVIDER_FAILURE");
    expect(h.state.markNeedsReconnect).not.toHaveBeenCalled();
    expect(h.state.markSyncFailed).toHaveBeenCalledTimes(1);
  });

  it("succeeds with zeros for a child without any course, next sync in about 30 minutes", async () => {
    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getValue()).toEqual({
      courses: 0,
      skippedCourses: 0,
      newAnnouncements: 0,
      eventsCreated: 0,
      failedAnnouncements: 0,
      failedCoursework: 0,
    });
    const [lease, at, next] = h.state.markSynced.mock.calls[0] ?? [];
    expect(lease).toEqual({ childId: CHILD.childId, lease: CHILD.lease });
    expect(at).toEqual(NOW);
    const delayMs = (next?.getTime() ?? 0) - NOW.getTime();
    expect(delayMs).toBeGreaterThanOrEqual(30 * MINUTE_MS);
    expect(delayMs).toBeLessThanOrEqual(35 * MINUTE_MS);
  });

  it("touches nothing for a child whose lease is gone, such as one being disconnected", async () => {
    h.state.holdsLease.mockResolvedValue(Result.ok<boolean, AppError>(false));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_LEASE_CONFLICT");
    expect(h.tokens.accessTokenFor).not.toHaveBeenCalled();
    expect(h.client.listCourses).not.toHaveBeenCalled();
    expect(h.state.markSynced).not.toHaveBeenCalled();
    expect(h.state.markSyncFailed).not.toHaveBeenCalled();
  });

  it("stops ingesting once the lease is lost during the sync", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    extractorAnswers({ "Annonce a1": [deadline("Contrôle")] });
    h.state.holdsLease
      .mockResolvedValueOnce(Result.ok<boolean, AppError>(true))
      .mockResolvedValue(Result.ok<boolean, AppError>(false));

    const result = await h.service.syncChild(CHILD, NOW);

    expect(h.ingest.ingest).not.toHaveBeenCalled();
    expect(h.ledger.record).not.toHaveBeenCalled();
    expect(result.getError().code).toBe("SYNC_LEASE_CONFLICT");
    expect(h.state.markSynced).not.toHaveBeenCalled();
  });
});

describe("syncChild, Classroom coursework (D13)", () => {
  const courseworkSent = () => h.ingest.ingestCoursework.mock.calls.map(([request]) => request);

  it("turns a dated coursework into a deadline in Paris time, without the model", async () => {
    h.givenCourses({ maths: [] });
    h.givenCoursework([coursework("w1", "maths", { date: "2026-11-19", time: "23:30" })]);

    const result = await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent()).toEqual([
      {
        userId: CHILD.userId,
        childId: CHILD.childId,
        courseId: "maths",
        items: [
          {
            id: "w1",
            title: "Devoir w1",
            url: "https://classroom.google.com/c/maths/a/w1",
            deadlineDate: "2026-11-20",
            deadlineTime: "00:30",
            done: false,
          },
        ],
        complete: true,
        presentIds: ["w1"],
      },
    ]);
    expect(h.extractor.extract).not.toHaveBeenCalled();
    expect(result.getValue().eventsCreated).toBe(1);
  });

  it("keeps a coursework due without a time as a whole day", async () => {
    h.givenCourses({ maths: [] });
    h.givenCoursework([coursework("w1", "maths", { date: "2026-11-19" })]);

    await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent()[0]?.items).toEqual([
      {
        id: "w1",
        title: "Devoir w1",
        url: "https://classroom.google.com/c/maths/a/w1",
        deadlineDate: "2026-11-19",
        done: false,
      },
    ]);
  });

  it("cuts a coursework title longer than 120 characters on a word", async () => {
    const words = Array.from({ length: 40 }, (_, n) => `mot${n}`).join(" ");
    h.givenCourses({ maths: [] });
    h.givenCoursework([
      { ...coursework("w1", "maths", { date: "2026-11-19" }), title: words },
      coursework("w2", "maths", { date: "2026-11-20" }),
    ]);

    await h.service.syncChild(CHILD, NOW);

    const titles = courseworkSent()[0]?.items.map(({ title }) => title) ?? [];
    expect(titles[0]?.length).toBeLessThanOrEqual(120);
    expect(words.startsWith(`${titles[0]} `)).toBe(true);
    expect(titles[1]).toBe("Devoir w2");
  });

  it("sends every read course with the dated coursework ids Classroom still lists", async () => {
    h.givenCourses({ maths: [], art: [] });
    h.givenCoursework([
      coursework("w1", "maths", { date: "2026-11-19" }),
      coursework("w2", "maths"),
      coursework("old", "maths", { date: "2026-08-01" }),
    ]);

    await h.service.syncChild(CHILD, NOW);

    const listings = Object.fromEntries(
      courseworkSent().map(({ courseId, items, complete, presentIds }) => [
        courseId,
        { items: items.map(({ id }) => id), complete, presentIds },
      ]),
    );
    expect(listings).toEqual({
      maths: { items: ["w1"], complete: true, presentIds: ["w1", "old"] },
      art: { items: [], complete: true, presentIds: [] },
    });
  });

  it("marks a course's coursework listing partial when it hit the page cap", async () => {
    h.givenCourses({ maths: [] });
    h.client.listCoursework.mockImplementation(async (_token, _courseId, scope) => {
      scope.truncated("coursework");
      return Result.ok<Coursework[], ClassroomError>([]);
    });

    await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent().map(({ complete }) => complete)).toEqual([false]);
  });

  it("keeps a course's coursework listing complete when only its submissions hit the cap", async () => {
    h.givenCourses({ maths: [] });
    h.client.listTurnedIn.mockImplementation(async (_token, _courseId, scope) => {
      scope.truncated("submissions");
      return Result.ok<string[], ClassroomError>([]);
    });

    await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent().map(({ complete }) => complete)).toEqual([true]);
  });

  it("ignores a coursework without a due date", async () => {
    h.givenCourses({ maths: [] });
    h.givenCoursework([coursework("w1", "maths")]);

    await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent()[0]?.items).toEqual([]);
  });

  it("ignores a coursework due before the 60-day window", async () => {
    h.givenCourses({ maths: [] });
    h.givenCoursework([
      coursework("old", "maths", { date: "2026-08-01" }),
      coursework("w1", "maths", { date: "2026-11-19" }),
    ]);

    await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent()[0]?.items.map(({ id }) => id)).toEqual(["w1"]);
  });

  it("marks a turned-in or returned coursework as done", async () => {
    h.givenCourses({ maths: [] });
    h.givenCoursework(
      [
        coursework("w1", "maths", { date: "2026-11-19" }),
        coursework("w2", "maths", { date: "2026-11-20" }),
      ],
      ["w2"],
    );

    await h.service.syncChild(CHILD, NOW);

    expect(courseworkSent()[0]?.items.map(({ id, done }) => [id, done])).toEqual([
      ["w1", false],
      ["w2", true],
    ]);
  });

  it("keeps an announcement deadline on a coursework's day, the agenda hides it while they match", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    h.givenCoursework([coursework("w1", "maths", { date: "2026-11-19" })]);
    extractorAnswers({ "Annonce a1": [deadline("Contrôle")] });

    await h.service.syncChild(CHILD, NOW);

    expect(h.ingest.ingest.mock.calls.map(([r]) => r.events.map((e) => e.title))).toEqual([
      ["Contrôle"],
    ]);
    expect(outcomes()).toEqual({ a1: { outcome: "extracted", attempts: 1 } });
  });

  it("skips a course whose coursework cannot be read, announcements included", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")], art: [announcement("a2", "art")] });
    h.client.listCoursework.mockImplementation(async (_token, courseId) =>
      courseId === "art"
        ? classroomFailure<Coursework[]>("CLASSROOM_PERMISSION_DENIED")
        : Result.ok<Coursework[], ClassroomError>([]),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getValue().skippedCourses).toBe(1);
    expect(h.extractor.extract.mock.calls.map(([r]) => r.text)).toEqual(["Annonce a1"]);
  });

  it("finishes the sync when saving a course's coursework fails, and reports it", async () => {
    h.givenCourses({ maths: [announcement("a1", "maths")] });
    h.givenCoursework([coursework("w1", "maths", { date: "2026-11-19" })]);
    h.ingest.ingestCoursework.mockResolvedValue(
      Result.fail<{ created: number }, AppError>({ code: "EVENT_PROVIDER_FAILURE", message: "x" }),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getValue().failedCoursework).toBe(1);
    expect(result.getValue().newAnnouncements).toBe(1);
    expect(h.state.markSynced).toHaveBeenCalledTimes(1);
  });
});

describe("syncChild, coursework of courses no longer listed", () => {
  const withdrawals = () =>
    h.ingest.withdrawCourseworkOutside.mock.calls.map(([request]) => request);

  it("withdraws the coursework outside the active courses after a complete course list", async () => {
    h.givenCourses({ maths: [], art: [] });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.isSuccess).toBe(true);
    expect(withdrawals()).toEqual([
      { userId: CHILD.userId, childId: CHILD.childId, activeCourseIds: ["maths", "art"] },
    ]);
  });

  it("withdraws nothing when the course list hit the page cap", async () => {
    h.client.listCourses.mockImplementation(async (_token, scope) => {
      scope.truncated("courses");
      return Result.ok<Course[], ClassroomError>([{ id: "maths" }]);
    });

    await h.service.syncChild(CHILD, NOW);

    expect(h.ingest.withdrawCourseworkOutside).not.toHaveBeenCalled();
  });

  it("withdraws nothing when the course list fails", async () => {
    h.client.listCourses.mockResolvedValue(
      Result.fail<Course[], ClassroomError>({ code: "CLASSROOM_PROVIDER_FAILURE", message: "503" }),
    );

    await h.service.syncChild(CHILD, NOW);

    expect(h.ingest.withdrawCourseworkOutside).not.toHaveBeenCalled();
  });

  it("withdraws nothing once the lease is lost", async () => {
    h.givenCourses({ maths: [] });
    h.client.listTurnedIn.mockImplementation(async () => {
      h.state.holdsLease.mockResolvedValue(Result.ok<boolean, AppError>(false));
      return Result.ok<string[], ClassroomError>([]);
    });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_LEASE_CONFLICT");
    expect(h.ingest.withdrawCourseworkOutside).not.toHaveBeenCalled();
  });

  it("keeps the sync successful when the withdrawal fails", async () => {
    h.givenCourses({ maths: [] });
    h.ingest.withdrawCourseworkOutside.mockResolvedValue(
      Result.fail<{ withdrawn: number }, AppError>({
        code: "EVENT_PROVIDER_FAILURE",
        message: "db",
      }),
    );

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.isSuccess).toBe(true);
    expect(h.state.markSynced).toHaveBeenCalled();
  });
});

describe("syncChild, lease lost while reading", () => {
  let held: boolean;
  let callsAfterLoss: number;

  beforeEach(() => {
    held = true;
    callsAfterLoss = 0;
    h.state.holdsLease.mockImplementation(async () => Result.ok<boolean, AppError>(held));
    const counted = <T>(answer: T) => {
      if (!held) callsAfterLoss += 1;
      return answer;
    };
    h.client.listAnnouncements.mockImplementation(async (_token, courseId) =>
      counted(Result.ok<Announcement[], ClassroomError>([announcement(`${courseId}-a`, courseId)])),
    );
    h.client.listCoursework.mockImplementation(async () =>
      counted(Result.ok<Coursework[], ClassroomError>([])),
    );
    h.client.listTurnedIn.mockImplementation(async () =>
      counted(Result.ok<string[], ClassroomError>([])),
    );
    h.extractor.extract.mockImplementation(async () =>
      counted(Result.ok<ExtractedDeadline[], AppError>([deadline("Contrôle")])),
    );
  });

  it("reads no course once the lease is lost after the course list", async () => {
    h.client.listCourses.mockImplementation(async () => {
      held = false;
      return Result.ok<Course[], ClassroomError>([{ id: "maths" }, { id: "art" }]);
    });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_LEASE_CONFLICT");
    expect(callsAfterLoss).toBe(0);
    expect(h.client.listAnnouncements).not.toHaveBeenCalled();
    expect(h.ingest.ingestCoursework).not.toHaveBeenCalled();
    expect(h.extractor.extract).not.toHaveBeenCalled();
    expect(h.state.markSynced).not.toHaveBeenCalled();
  });

  it("sends no announcement to the model once the lease is lost after the reads", async () => {
    h.client.listCourses.mockResolvedValue(Result.ok<Course[], ClassroomError>([{ id: "maths" }]));
    h.client.listTurnedIn.mockImplementation(async () => {
      held = false;
      return Result.ok<string[], ClassroomError>([]);
    });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.getError().code).toBe("SYNC_LEASE_CONFLICT");
    expect(callsAfterLoss).toBe(0);
    expect(h.extractor.extract).not.toHaveBeenCalled();
    expect(h.ledger.record).not.toHaveBeenCalled();
  });

  it("hands Google a read scope that closes with the lease", async () => {
    const answers: boolean[] = [];
    h.client.listCourses.mockImplementation(async (_token, scope) => {
      answers.push(await scope.mayContinue());
      held = false;
      answers.push(await scope.mayContinue());
      return Result.ok<Course[], ClassroomError>([]);
    });

    await h.service.syncChild(CHILD, NOW);

    expect(answers).toEqual([true, false]);
  });
});

describe("syncChild, listings cut at the page cap", () => {
  it("logs a warning naming the child and the listing, without content", async () => {
    h.givenCourses({ maths: [] });
    h.client.listCoursework.mockImplementation(async (_token, _courseId, scope) => {
      scope.truncated("coursework");
      return Result.ok<Coursework[], ClassroomError>([]);
    });

    const result = await h.service.syncChild(CHILD, NOW);

    expect(result.isSuccess).toBe(true);
    expect(h.logger.warn.mock.calls).toEqual([
      [{ childId: CHILD.childId, listing: "coursework" }, "classroom listing cut at the page cap"],
    ]);
  });
});

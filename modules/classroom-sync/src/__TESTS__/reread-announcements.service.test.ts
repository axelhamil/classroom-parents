import { beforeEach, describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import {
  type IAnnouncementExtractor,
  READING_NOT_CACHED_CODE,
  READING_PAUSED_CODE,
} from "../application/ports/announcement-extractor.port";
import type { IChildAccessTokens } from "../application/ports/child-access-tokens.port";
import type { IClassroomReader } from "../application/ports/classroom-reader.port";
import type { IEventIngest } from "../application/ports/event-ingest.port";
import type { IParentChildren } from "../application/ports/parent-children.port";
import type { ISeenAnnouncementRepository } from "../application/ports/seen-announcement-repository.port";
import {
  RereadAnnouncementsService,
  type RereadMode,
} from "../application/services/reread-announcements.service";
import { announcement, CHILD, deadline, NOW } from "./sync-harness";

const NOT_CACHED: AppError = { code: READING_NOT_CACHED_CODE, message: "not cached" };
const PAUSED: AppError = { code: READING_PAUSED_CODE, message: "paused" };
const QUOTA: AppError = { code: "EXTRACTION_PROVIDER_FAILURE", message: "budget exhausted" };
const ONE_CHANGED = { matched: 1, changed: 1, unmatched: 0 };

let extractor: PortMock<IAnnouncementExtractor>;
let events: PortMock<IEventIngest>;
let service: RereadAnnouncementsService;

beforeEach(() => {
  const children = mockPort<IParentChildren>();
  children.childrenOf.mockResolvedValue(
    Result.ok([{ childId: CHILD.childId, label: CHILD.label }]),
  );
  const tokens = mockPort<IChildAccessTokens>();
  tokens.accessTokenFor.mockResolvedValue(Result.ok("token"));
  const reader = mockPort<IClassroomReader>();
  reader.listCourses.mockResolvedValue(
    Result.ok({ courses: [{ id: "c1", name: Option.none<string>() }], complete: true }),
  );
  reader.profileNames.mockResolvedValue(Result.ok([]));
  reader.recentAnnouncements.mockResolvedValue(
    Result.ok([announcement("read-before", "c1"), announcement("never-dated", "c1")]),
  );
  const ledger = mockPort<ISeenAnnouncementRepository>();
  ledger.findForCourse.mockResolvedValue(
    Result.ok([
      { announcementId: "read-before", outcome: "extracted", attempts: 1 },
      { announcementId: "never-dated", outcome: "no_event", attempts: 1 },
    ]),
  );
  extractor = mockPort<IAnnouncementExtractor>();
  events = mockPort<IEventIngest>();
  events.previewReread.mockResolvedValue(Result.ok(ONE_CHANGED));
  events.applyReread.mockResolvedValue(Result.ok(ONE_CHANGED));

  service = new RereadAnnouncementsService(
    children,
    tokens,
    reader,
    ledger,
    extractor,
    events,
    mockInstrumentation(),
  );
});

const reread = async (mode: RereadMode) => {
  const report = await service.reread({ userId: CHILD.userId, mode }, NOW);
  const [child] = report.getValue().children;
  if (child === undefined) throw new Error("the child report is missing");

  return child;
};

const readByModel = () =>
  extractor.extract.mockImplementation(async ({ cacheOnly }) =>
    cacheOnly
      ? Result.fail(NOT_CACHED)
      : Result.ok({ deadlines: [deadline("Sortie piscine")], amendments: [] }),
  );

describe("RereadAnnouncementsService", () => {
  it("given a dry run, when the reading is cached, then only the announcement that gave deadlines is previewed and nothing is written", async () => {
    extractor.extract.mockResolvedValue(
      Result.ok({ deadlines: [deadline("Sortie piscine")], amendments: [] }),
    );

    const child = await reread("dry_run");

    expect(child.announcementsWithDeadlines).toBe(1);
    expect(child.readWithoutModel).toBe(1);
    expect(child.deadlines).toEqual(ONE_CHANGED);
    expect(events.previewReread.mock.calls.map(([request]) => request.announcementId)).toEqual([
      "read-before",
    ]);
    expect(events.applyReread).not.toHaveBeenCalled();
  });

  it("given a dry run, when the reading is not cached, then the model is never called", async () => {
    readByModel();

    const child = await reread("dry_run");

    expect(child.modelCallsSkipped).toBe(1);
    expect(extractor.extract.mock.calls.every(([request]) => request.cacheOnly === true)).toBe(
      true,
    );
    expect(events.previewReread).not.toHaveBeenCalled();
  });

  it("given an apply, when the reading is not cached, then the model reads it and the deadlines are written through the agenda", async () => {
    readByModel();

    const child = await reread("apply");

    expect(child.readByModel).toBe(1);
    expect(events.applyReread).toHaveBeenCalledTimes(1);
    expect(events.previewReread).not.toHaveBeenCalled();
  });

  it("given an apply, when the family opposed the reading or its quota refuses it, then nothing is written", async () => {
    extractor.extract.mockResolvedValueOnce(Result.fail(PAUSED));

    const paused = await reread("apply");
    extractor.extract.mockImplementation(async ({ cacheOnly }) =>
      Result.fail(cacheOnly ? NOT_CACHED : QUOTA),
    );
    const refused = await reread("apply");

    expect(paused.readingPaused).toBe(1);
    expect(refused.failures).toEqual({ EXTRACTION_PROVIDER_FAILURE: 1 });
    expect(events.applyReread).not.toHaveBeenCalled();
  });
});

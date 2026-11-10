import { describe, expect, it } from "bun:test";
import type { EventDeadlineDto } from "@modules/agenda/application/dto/event.dto";
import type { AgendaError } from "@modules/agenda/application/ports/event-repository.port";
import type { ChildDto } from "@modules/children/application/dto/child.dto";
import type { ChildrenError } from "@modules/children/application/ports/child-repository.port";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import {
  alertPlannerFor,
  announcementExtractorFor,
  childAccessTokensFor,
  childConnectionsFor,
  childOwnershipFor,
  childSyncStateFor,
  dueChildrenFor,
  eventDeadlinesFor,
  eventIngestFor,
  manualSyncGateFor,
  visibleChildrenFor,
} from "../bindings";

const FAMILY_A = "parent-a";
const FAMILY_B = "parent-b";
const LEA = "0196a000-0000-7000-8000-00000000000a";
const PUBLISHED_AT = new Date("2026-11-09T07:00:00Z");

const childFailure = (code: ChildrenError["code"], message = "message"): ChildrenError => ({
  code,
  message,
});

describe("agenda IChildOwnership bound to children", () => {
  const children = {
    isOwnedBy: async (userId: string, childId: string) =>
      Result.ok<boolean, ChildrenError>(userId === FAMILY_A && childId === LEA),
  };

  it("answers owned for the parent's own child", async () => {
    const result = await childOwnershipFor(children).isOwnedBy(FAMILY_A, LEA);

    expect(result.getValue()).toBe(true);
  });

  it("answers not owned when another family names that child", async () => {
    const result = await childOwnershipFor(children).isOwnedBy(FAMILY_B, LEA);

    expect(result.getValue()).toBe(false);
  });

  it("passes a children failure through with its code", async () => {
    const failing = {
      isOwnedBy: async () =>
        Result.fail<boolean, ChildrenError>(childFailure("CHILD_PROVIDER_FAILURE")),
    };

    const result = await childOwnershipFor(failing).isOwnedBy(FAMILY_A, LEA);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("agenda IVisibleChildren bound to children", () => {
  const child = (id: string, status: ChildDto["status"]): ChildDto => ({
    id,
    label: id,
    googleEmail: `${id}@example.fr`,
    status,
    syncing: false,
  });

  it("hides a child being disconnected and keeps every other state", async () => {
    let asked: unknown;
    const visible = visibleChildrenFor({
      list: async (userId) => {
        asked = userId;
        return Result.ok<ChildDto[], ChildrenError>([
          child("lea", "connected"),
          child("tom", "disconnecting"),
          child("mia", "needs_reconnect"),
          child("noe", "blocked_by_school"),
        ]);
      },
    });

    const result = await visible.idsOf(FAMILY_A);

    expect(asked).toBe(FAMILY_A);
    expect(result.getValue()).toEqual(["lea", "mia", "noe"]);
  });

  it("passes a children failure through", async () => {
    const visible = visibleChildrenFor({
      list: async () =>
        Result.fail<ChildDto[], ChildrenError>(childFailure("CHILD_PROVIDER_FAILURE")),
    });

    const result = await visible.idsOf(FAMILY_A);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("alerts IEventDeadlines bound to the agenda", () => {
  const EXAM = "0196a000-0000-7000-8000-0000000000e1";
  const deadline = {
    deadlineAt: new Date("2026-11-19T07:30:00.000Z"),
    deadlineDate: "2026-11-19",
    deadlineTime: "08:30",
    done: true,
  };

  it("passes every deadline field of the parent's own alertable event", async () => {
    const agenda = {
      alertDeadline: async (userId: string, eventId: string) =>
        Result.ok<Option<EventDeadlineDto>, AgendaError>(
          userId === FAMILY_A && eventId === EXAM ? Option.some(deadline) : Option.none(),
        ),
    };

    const result = await eventDeadlinesFor(agenda).forUser(FAMILY_A, EXAM);

    expect(result.getValue().toUndefined()).toEqual(deadline);
  });

  it("answers none when the agenda hides the event from that family", async () => {
    const agenda = {
      alertDeadline: async () => Result.ok<Option<EventDeadlineDto>, AgendaError>(Option.none()),
    };

    const result = await eventDeadlinesFor(agenda).forUser(FAMILY_B, EXAM);

    expect(result.getValue().isNone()).toBe(true);
  });

  it("passes an agenda failure through with its code", async () => {
    const agenda = {
      alertDeadline: async () =>
        Result.fail<Option<EventDeadlineDto>, AgendaError>({
          code: "EVENT_PROVIDER_FAILURE",
          message: "down",
        }),
    };

    const result = await eventDeadlinesFor(agenda).forUser(FAMILY_A, EXAM);

    expect(result.getError().code).toBe("EVENT_PROVIDER_FAILURE");
  });
});

describe("sync IAnnouncementExtractor bound to extraction", () => {
  const extracted = {
    title: "Évaluation de fractions",
    description: "Réviser le chapitre 3",
    category: "assessment" as const,
    deadlineDate: "2026-11-19",
    deadlineTime: "08:30",
    confidence: "low" as const,
    needsReview: true,
    reviewReasons: ["low_confidence" as const],
  };

  it("keeps every field the agenda needs, review flag and time included", async () => {
    let received: unknown;
    const extractor = announcementExtractorFor({
      extract: async (input) => {
        received = input;
        return Result.ok([extracted]);
      },
    });

    const result = await extractor.extract({
      text: "Évaluation jeudi 19 novembre",
      publishedAt: PUBLISHED_AT,
      childNames: ["Léa", "Léa Martin"],
    });

    expect(received).toEqual({
      text: "Évaluation jeudi 19 novembre",
      publishedAt: PUBLISHED_AT,
      childNames: ["Léa", "Léa Martin"],
    });
    expect(result.getValue()).toEqual([
      {
        title: "Évaluation de fractions",
        description: "Réviser le chapitre 3",
        category: "assessment",
        deadlineDate: "2026-11-19",
        deadlineTime: "08:30",
        needsReview: true,
      },
    ]);
  });

  it("leaves the time out when the announcement gives none", async () => {
    const { deadlineTime: _dropped, ...withoutTime } = extracted;
    const extractor = announcementExtractorFor({
      extract: async () => Result.ok([{ ...withoutTime, needsReview: false }]),
    });

    const [deadline] = (
      await extractor.extract({ text: "x", publishedAt: PUBLISHED_AT, childNames: [] })
    ).getValue();

    expect(deadline).toEqual({
      title: extracted.title,
      description: extracted.description,
      category: "assessment",
      deadlineDate: "2026-11-19",
      needsReview: false,
    });
  });

  it("passes the extraction error code and message through", async () => {
    const extractor = announcementExtractorFor({
      extract: async () =>
        Result.fail({ code: "EXTRACTION_RATE_LIMITED" as const, message: "too many calls" }),
    });

    const result = await extractor.extract({
      text: "x",
      publishedAt: PUBLISHED_AT,
      childNames: [],
    });

    expect(result.getError()).toEqual({
      code: "EXTRACTION_RATE_LIMITED",
      message: "too many calls",
    });
  });
});

describe("sync IEventIngest bound to the agenda", () => {
  const failure: AppError = { code: "EVENT_CHILD_NOT_FOUND", message: "absent" };

  it("forwards an announcement and answers how many events were created", async () => {
    let received: unknown;
    const ingest = eventIngestFor({
      ingest: async (input) => {
        received = input;
        return Result.ok({ created: 2, skipped: 1 });
      },
      ingestCoursework: async () =>
        Result.ok({ created: 0, updated: 0, rejected: 0, withdrawn: 0 }),
      withdrawCourseworkOutside: async () => Result.ok({ withdrawn: 0 }),
    });
    const request = {
      userId: FAMILY_A,
      childId: LEA,
      announcement: { id: "a1", courseId: "c1", url: "https://x/a1", publishedAt: PUBLISHED_AT },
      events: [
        {
          title: "Piscine",
          description: "Bonnet",
          category: "swimming",
          deadlineDate: "2026-11-26",
          deadlineTime: "09:00",
          needsReview: false,
        },
      ],
    };

    const result = await ingest.ingest(request);

    expect(received).toEqual(request);
    expect(result.getValue()).toEqual({ created: 2 });
  });

  it("forwards a coursework batch with its completeness and answers created", async () => {
    let received: unknown;
    const ingest = eventIngestFor({
      ingest: async () => Result.ok({ created: 0, skipped: 0 }),
      ingestCoursework: async (input) => {
        received = input;
        return Result.ok({ created: 3, updated: 1, rejected: 0, withdrawn: 1 });
      },
      withdrawCourseworkOutside: async () => Result.ok({ withdrawn: 0 }),
    });
    const request = {
      userId: FAMILY_A,
      childId: LEA,
      courseId: "c1",
      items: [
        {
          id: "w1",
          title: "Exposé",
          url: "https://x/w1",
          deadlineDate: "2026-11-20",
          deadlineTime: "17:00",
          done: true,
        },
      ],
      complete: false,
      presentIds: ["w1", "w2"],
    };

    const result = await ingest.ingestCoursework(request);

    expect(received).toEqual(request);
    expect(result.getValue()).toEqual({ created: 3 });
  });

  it("forwards the active courses and answers how many were withdrawn", async () => {
    let received: unknown;
    const ingest = eventIngestFor({
      ingest: async () => Result.ok({ created: 0, skipped: 0 }),
      ingestCoursework: async () =>
        Result.ok({ created: 0, updated: 0, rejected: 0, withdrawn: 0 }),
      withdrawCourseworkOutside: async (input) => {
        received = input;
        return Result.ok({ withdrawn: 4 });
      },
    });

    const result = await ingest.withdrawCourseworkOutside({
      userId: FAMILY_A,
      childId: LEA,
      activeCourseIds: ["c1"],
    });

    expect(received).toEqual({ userId: FAMILY_A, childId: LEA, activeCourseIds: ["c1"] });
    expect(result.getValue()).toEqual({ withdrawn: 4 });
  });

  it("passes an agenda failure through on each of the three calls", async () => {
    const ingest = eventIngestFor({
      ingest: async () => Result.fail(failure),
      ingestCoursework: async () => Result.fail(failure),
      withdrawCourseworkOutside: async () => Result.fail(failure),
    });

    const codes = [
      (
        await ingest.ingest({
          userId: "u",
          childId: "c",
          announcement: { id: "a", courseId: "c", url: "u", publishedAt: PUBLISHED_AT },
          events: [],
        })
      ).getError().code,
      (
        await ingest.ingestCoursework({
          userId: "u",
          childId: "c",
          courseId: "c",
          items: [],
          complete: true,
          presentIds: [],
        })
      ).getError().code,
      (
        await ingest.withdrawCourseworkOutside({ userId: "u", childId: "c", activeCourseIds: [] })
      ).getError().code,
    ];

    expect(codes).toEqual([
      "EVENT_CHILD_NOT_FOUND",
      "EVENT_CHILD_NOT_FOUND",
      "EVENT_CHILD_NOT_FOUND",
    ]);
  });
});

describe("sync IDueChildren bound to children", () => {
  it("maps each claimed child with its owner, displayed first name and lease", async () => {
    let asked: unknown;
    const due = dueChildrenFor({
      claimDueForSync: async (limit, now) => {
        asked = { limit, now };
        return Result.ok([{ childId: LEA, userId: FAMILY_A, label: "Léa", lease: 7 }]);
      },
    });

    const result = await due.claimDue(100, PUBLISHED_AT);

    expect(asked).toEqual({ limit: 100, now: PUBLISHED_AT });
    expect(result.getValue()).toEqual([{ childId: LEA, userId: FAMILY_A, label: "Léa", lease: 7 }]);
  });

  it("passes a claim failure through", async () => {
    const due = dueChildrenFor({
      claimDueForSync: async () => Result.fail(childFailure("CHILD_PROVIDER_FAILURE")),
    });

    expect((await due.claimDue(1, PUBLISHED_AT)).getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("sync IChildAccessTokens bound to children", () => {
  const tokensFailingWith = (code: ChildrenError["code"]) =>
    childAccessTokensFor({ accessTokenFor: async () => Result.fail(childFailure(code)) });

  it("serves the live access token", async () => {
    const tokens = childAccessTokensFor({ accessTokenFor: async () => Result.ok("ya29.live") });

    expect((await tokens.accessTokenFor(LEA)).getValue()).toBe("ya29.live");
  });

  it("asks for a reconnect when the grant is gone, the link absent or the child unknown", async () => {
    const failures = await Promise.all(
      (["CHILD_TOKEN_INVALID_GRANT", "CHILD_ACCOUNT_NOT_LINKED", "CHILD_NOT_FOUND"] as const).map(
        async (code) => (await tokensFailingWith(code).accessTokenFor(LEA)).getError(),
      ),
    );

    expect(failures).toEqual(["reconnect_needed", "reconnect_needed", "reconnect_needed"]);
  });

  it("reads any other failure as a provider failure", async () => {
    const result = await tokensFailingWith("CHILD_PROVIDER_FAILURE").accessTokenFor(LEA);

    expect(result.getError()).toBe("provider_failure");
  });
});

describe("sync IChildSyncState bound to children", () => {
  const lease = { childId: LEA, lease: 3 };
  const leaseConflict = childFailure("CHILD_SYNC_LEASE_CONFLICT", "reprise par une autre tâche");

  const service = (overrides: Partial<Parameters<typeof childSyncStateFor>[0]> = {}) =>
    childSyncStateFor({
      holdsLease: async () => Result.ok(true),
      markSynced: async () => Result.ok(),
      markSyncFailed: async () => Result.ok(),
      markNeedsReconnect: async () => Result.ok(),
      ...overrides,
    });

  it("answers whether the lease is still held", async () => {
    let asked: unknown;
    const state = service({
      holdsLease: async (held) => {
        asked = held;
        return Result.ok(false);
      },
    });

    const result = await state.holdsLease(lease);

    expect(asked).toEqual(lease);
    expect(result.getValue()).toBe(false);
  });

  it("forwards the lease and both instants when the sync ends", async () => {
    let asked: unknown;
    const next = new Date("2026-11-09T07:30:00Z");
    const state = service({
      markSynced: async (held, at, nextSyncAt) => {
        asked = { held, at, nextSyncAt };
        return Result.ok();
      },
    });

    expect((await state.markSynced(lease, PUBLISHED_AT, next)).isSuccess).toBe(true);
    expect(asked).toEqual({ held: lease, at: PUBLISHED_AT, nextSyncAt: next });
  });

  it("forwards the retry instant of a failed sync", async () => {
    let asked: unknown;
    const retry = new Date("2026-11-09T07:10:00Z");
    const state = service({
      markSyncFailed: async (held, nextSyncAt) => {
        asked = { held, nextSyncAt };
        return Result.ok();
      },
    });

    await state.markSyncFailed(lease, retry);

    expect(asked).toEqual({ held: lease, nextSyncAt: retry });
  });

  it("forwards the reconnect cause", async () => {
    let asked: unknown;
    const state = service({
      markNeedsReconnect: async (childId, cause) => {
        asked = { childId, cause };
        return Result.ok();
      },
    });

    await state.markNeedsReconnect(LEA, "school_blocked");

    expect(asked).toEqual({ childId: LEA, cause: "school_blocked" });
  });

  it("turns a lost lease into the sync's own conflict code, message kept", async () => {
    const state = service({
      markSynced: async () => Result.fail(leaseConflict),
      markSyncFailed: async () => Result.fail(leaseConflict),
    });

    const errors = [
      (await state.markSynced(lease, PUBLISHED_AT, PUBLISHED_AT)).getError(),
      (await state.markSyncFailed(lease, PUBLISHED_AT)).getError(),
    ];

    expect(errors).toEqual([
      { code: "SYNC_LEASE_CONFLICT", message: "reprise par une autre tâche" },
      { code: "SYNC_LEASE_CONFLICT", message: "reprise par une autre tâche" },
    ]);
  });

  it("passes any other failure through", async () => {
    const state = service({
      holdsLease: async () => Result.fail(childFailure("CHILD_PROVIDER_FAILURE")),
      markNeedsReconnect: async () => Result.fail(childFailure("CHILD_NOT_FOUND")),
    });

    expect((await state.holdsLease(lease)).getError().code).toBe("CHILD_PROVIDER_FAILURE");
    expect((await state.markNeedsReconnect(LEA, "invalid_grant")).getError().code).toBe(
      "CHILD_NOT_FOUND",
    );
  });
});

describe("sync IManualSyncGate bound to children", () => {
  const listed = (ids: string[]) =>
    Result.ok<
      { id: string; label: string; googleEmail: string; status: "connected"; syncing: boolean }[],
      ChildrenError
    >(
      ids.map((id) => ({
        id,
        label: "x",
        googleEmail: "x@y.fr",
        status: "connected",
        syncing: false,
      })),
    );

  type GateParts = Parameters<typeof manualSyncGateFor>;

  const gate = ({
    list = async () => listed([]),
    claimManualSync = async () => Result.ok({ outcome: "throttled" as const }),
  }: Partial<GateParts[0] & GateParts[1]> = {}) => manualSyncGateFor({ list }, { claimManualSync });

  it("lists the parent's child ids", async () => {
    let asked: unknown;
    const result = await gate({
      list: async (userId) => {
        asked = userId;
        return listed([LEA, "other"]);
      },
    }).childIdsOf(FAMILY_A);

    expect(asked).toBe(FAMILY_A);
    expect(result.getValue()).toEqual([LEA, "other"]);
  });

  it("starts with the lease number and the displayed first name", async () => {
    let asked: unknown;
    const result = await gate({
      claimManualSync: async (userId, childId, now) => {
        asked = { userId, childId, now };
        return Result.ok({
          outcome: "started" as const,
          lease: { childId: LEA, lease: 9 },
          label: "Léa",
        });
      },
    }).claim(FAMILY_A, LEA, PUBLISHED_AT);

    expect(asked).toEqual({ userId: FAMILY_A, childId: LEA, now: PUBLISHED_AT });
    expect(result.getValue()).toEqual({ outcome: "started", lease: 9, label: "Léa" });
  });

  it("keeps running and throttled outcomes", async () => {
    const running = await gate({
      claimManualSync: async () => Result.ok({ outcome: "running" as const }),
    }).claim(FAMILY_A, LEA, PUBLISHED_AT);
    const throttled = await gate().claim(FAMILY_A, LEA, PUBLISHED_AT);

    expect(running.getValue()).toEqual({ outcome: "running" });
    expect(throttled.getValue()).toEqual({ outcome: "throttled" });
  });

  it("maps children codes to the sync's codes and keeps the parent-facing message", async () => {
    const claimFailing = (code: ChildrenError["code"]) =>
      gate({ claimManualSync: async () => Result.fail(childFailure(code, `msg ${code}`)) }).claim(
        FAMILY_A,
        LEA,
        PUBLISHED_AT,
      );

    const errors = [
      (await claimFailing("CHILD_NOT_FOUND")).getError(),
      (await claimFailing("CHILD_SYNC_BLOCKED")).getError(),
      (await claimFailing("CHILD_PROVIDER_FAILURE")).getError(),
      (
        await gate({
          list: async () => Result.fail(childFailure("CHILD_PROVIDER_FAILURE", "down")),
        }).childIdsOf(FAMILY_A)
      ).getError(),
    ];

    expect(errors).toEqual([
      { code: "SYNC_CHILD_NOT_FOUND", message: "msg CHILD_NOT_FOUND" },
      { code: "SYNC_BLOCKED", message: "msg CHILD_SYNC_BLOCKED" },
      { code: "SYNC_PROVIDER_FAILURE", message: "msg CHILD_PROVIDER_FAILURE" },
      { code: "SYNC_PROVIDER_FAILURE", message: "down" },
    ]);
  });
});

describe("rgpd IChildConnections bound to children", () => {
  it("revokes every child of the erased account and reports the tally", async () => {
    let asked: unknown;
    const connections = childConnectionsFor({
      revokeAllFor: async (userId) => {
        asked = userId;
        return Result.ok({ revoked: 2, failed: 1 });
      },
    });

    const result = await connections.revokeAll(FAMILY_A);

    expect(asked).toBe(FAMILY_A);
    expect(result.getValue()).toEqual({ revoked: 2, failed: 1 });
  });

  it("passes a revocation failure through", async () => {
    const connections = childConnectionsFor({
      revokeAllFor: async () => Result.fail(childFailure("CHILD_PROVIDER_FAILURE")),
    });

    expect((await connections.revokeAll(FAMILY_A)).getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("agenda IAlertPlanner bound to alerts", () => {
  it("resolves the planning service only when agenda calls it, then forwards each call", async () => {
    const calls: unknown[] = [];
    let resolved = 0;
    const planner = alertPlannerFor(() => {
      resolved += 1;
      return {
        planDefault: async (event) => {
          calls.push(["planDefault", event]);
          return Result.ok();
        },
        replan: async (event) => {
          calls.push(["replan", event]);
          return Result.ok();
        },
        cancel: async (eventId, actorUserId) => {
          calls.push(["cancel", eventId, actorUserId]);
          return Result.ok();
        },
      };
    });
    const deadline = {
      eventId: "event-1",
      userId: FAMILY_A,
      deadlineDate: "2026-11-19",
      actorUserId: null,
    };

    expect(resolved).toBe(0);
    await planner.planDefault(deadline);
    await planner.replan({ ...deadline, actorUserId: FAMILY_A });
    await planner.cancel("event-1", FAMILY_A);

    expect(calls).toEqual([
      ["planDefault", { eventId: "event-1", userId: FAMILY_A, actorUserId: null }],
      ["replan", { eventId: "event-1", userId: FAMILY_A, actorUserId: FAMILY_A }],
      ["cancel", "event-1", FAMILY_A],
    ]);
  });
});

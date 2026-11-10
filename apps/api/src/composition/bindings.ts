import type { IAlertPlanner } from "@modules/agenda/application/ports/alert-planner.port";
import type { IChildOwnership } from "@modules/agenda/application/ports/child-ownership.port";
import type { IVisibleChildren } from "@modules/agenda/application/ports/visible-children.port";
import type { EventIngestService } from "@modules/agenda/application/services/event-ingest.service";
import type { EventQueryService } from "@modules/agenda/application/services/event-query.service";
import type { IEventDeadlines } from "@modules/alerts/application/ports/event-deadlines.port";
import type { AlertPlanningService } from "@modules/alerts/application/services/alert-planning.service";
import type { ChildrenError } from "@modules/children/application/ports/child-repository.port";
import type { ChildConnectionService } from "@modules/children/application/services/child-connection.service";
import type { ChildSyncService } from "@modules/children/application/services/child-sync.service";
import type { GoogleAccessService } from "@modules/children/application/services/google-access.service";
import type { IAnnouncementExtractor } from "@modules/classroom-sync/application/ports/announcement-extractor.port";
import type { IChildAccessTokens } from "@modules/classroom-sync/application/ports/child-access-tokens.port";
import type { IChildSyncState } from "@modules/classroom-sync/application/ports/child-sync-state.port";
import type { IDueChildren } from "@modules/classroom-sync/application/ports/due-children.port";
import type { IEventIngest } from "@modules/classroom-sync/application/ports/event-ingest.port";
import type { IManualSyncGate } from "@modules/classroom-sync/application/ports/manual-sync-gate.port";
import type { SyncError } from "@modules/classroom-sync/application/sync-error";
import type { ExtractionService } from "@modules/extraction/application/services/extraction.service";
import { type AppError, Result } from "@packages/ddd-kit";
import type { IChildConnections } from "../modules/rgpd/application/ports/child-connections.port";

type Children<K extends keyof ChildConnectionService> = Pick<ChildConnectionService, K>;
type ChildSync<K extends keyof ChildSyncService> = Pick<ChildSyncService, K>;

const RECONNECT_CODES: ReadonlySet<ChildrenError["code"]> = new Set([
  "CHILD_TOKEN_INVALID_GRANT",
  "CHILD_ACCOUNT_NOT_LINKED",
  "CHILD_NOT_FOUND",
]);

const SYNC_CODES: Partial<Record<ChildrenError["code"], SyncError["code"]>> = {
  CHILD_NOT_FOUND: "SYNC_CHILD_NOT_FOUND",
  CHILD_SYNC_BLOCKED: "SYNC_BLOCKED",
  CHILD_SYNC_LEASE_CONFLICT: "SYNC_LEASE_CONFLICT",
};

function asSyncError(error: ChildrenError): SyncError {
  return { code: SYNC_CODES[error.code] ?? "SYNC_PROVIDER_FAILURE", message: error.message };
}

function withLeaseConflict(error: ChildrenError): AppError {
  if (error.code !== "CHILD_SYNC_LEASE_CONFLICT") return error;

  return { code: "SYNC_LEASE_CONFLICT", message: error.message };
}

export function childOwnershipFor(children: ChildSync<"isOwnedBy">): IChildOwnership {
  return { isOwnedBy: (userId, childId) => children.isOwnedBy(userId, childId) };
}

export function visibleChildrenFor(children: Children<"list">): IVisibleChildren {
  return {
    idsOf: async (userId) =>
      (await children.list(userId)).map((listed) =>
        listed.filter(({ status }) => status !== "disconnecting").map(({ id }) => id),
      ),
  };
}

export function eventDeadlinesFor(
  agenda: Pick<EventQueryService, "alertDeadline">,
): IEventDeadlines {
  return {
    forUser: async (userId, eventId) =>
      (await agenda.alertDeadline(userId, eventId)).map((found) =>
        found.map(({ deadlineAt, deadlineDate, deadlineTime, done }) => ({
          deadlineAt,
          deadlineDate,
          deadlineTime,
          done,
        })),
      ),
  };
}

export function announcementExtractorFor(
  extraction: Pick<ExtractionService, "extract">,
): IAnnouncementExtractor {
  return {
    extract: async (request) => {
      const extracted = await extraction.extract(request);

      return extracted.map((events) =>
        events.map((event) => ({
          title: event.title,
          description: event.description,
          category: event.category,
          deadlineDate: event.deadlineDate,
          ...(event.deadlineTime === undefined ? {} : { deadlineTime: event.deadlineTime }),
          needsReview: event.needsReview,
        })),
      );
    },
  };
}

export function eventIngestFor(
  agenda: Pick<EventIngestService, "ingest" | "ingestCoursework" | "withdrawCourseworkOutside">,
): IEventIngest {
  return {
    ingest: async (request) => (await agenda.ingest(request)).map(({ created }) => ({ created })),
    ingestCoursework: async (request) =>
      (await agenda.ingestCoursework(request)).map(({ created }) => ({ created })),
    withdrawCourseworkOutside: async (request) =>
      (await agenda.withdrawCourseworkOutside(request)).map(({ withdrawn }) => ({ withdrawn })),
  };
}

export function dueChildrenFor(children: ChildSync<"claimDueForSync">): IDueChildren {
  return {
    claimDue: async (limit, now) =>
      (await children.claimDueForSync(limit, now)).map((due) =>
        due.map(({ childId, userId, label, lease }) => ({ childId, userId, label, lease })),
      ),
  };
}

export function childAccessTokensFor(
  children: Pick<GoogleAccessService, "accessTokenFor">,
): IChildAccessTokens {
  return {
    accessTokenFor: async (childId) => {
      const token = await children.accessTokenFor(childId);
      if (token.isSuccess) return Result.ok(token.getValue());

      return Result.fail(
        RECONNECT_CODES.has(token.getError().code) ? "reconnect_needed" : "provider_failure",
      );
    },
  };
}

export function childSyncStateFor(
  children: ChildSync<"holdsLease" | "markSynced" | "markSyncFailed" | "markNeedsReconnect">,
): IChildSyncState {
  return {
    holdsLease: (lease) => children.holdsLease(lease),
    markSynced: async (lease, at, nextSyncAt) =>
      (await children.markSynced(lease, at, nextSyncAt)).mapError(withLeaseConflict),
    markSyncFailed: async (lease, nextSyncAt) =>
      (await children.markSyncFailed(lease, nextSyncAt)).mapError(withLeaseConflict),
    markNeedsReconnect: (childId, cause) => children.markNeedsReconnect(childId, cause),
  };
}

export function manualSyncGateFor(
  connection: Children<"list">,
  sync: ChildSync<"claimManualSync">,
): IManualSyncGate {
  return {
    childIdsOf: async (userId) =>
      (await connection.list(userId))
        .map((listed) => listed.map(({ id }) => id))
        .mapError(asSyncError),
    claim: async (userId, childId, now) => {
      const claimed = await sync.claimManualSync(userId, childId, now);
      if (claimed.isFailure) return Result.fail(asSyncError(claimed.getError()));

      const claim = claimed.getValue();
      if (claim.outcome !== "started") return Result.ok({ outcome: claim.outcome });

      return Result.ok({ outcome: "started", lease: claim.lease.lease, label: claim.label });
    },
  };
}

export function childConnectionsFor(children: Children<"revokeAllFor">): IChildConnections {
  return { revokeAll: (userId) => children.revokeAllFor(userId) };
}

export function alertPlannerFor(
  planning: () => Pick<AlertPlanningService, "planDefault" | "replan" | "cancel">,
): IAlertPlanner {
  return {
    planDefault: ({ eventId, userId, actorUserId }) =>
      planning().planDefault({ eventId, userId, actorUserId }),
    replan: ({ eventId, userId, actorUserId }) =>
      planning().replan({ eventId, userId, actorUserId }),
    cancel: (eventId, actorUserId) => planning().cancel(eventId, actorUserId),
  };
}

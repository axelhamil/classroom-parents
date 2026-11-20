import { type IDomainEvent, Option, onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { notificationRef } from "@packages/events/notification-ref";
import type { z } from "zod";
import type { NotificationContent } from "../../domain/notification-content";
import type { NotificationDraft } from "../ports/notification-repository.port";
import type { NotificationPostingService } from "../services/notification-posting.service";

type PostingDeps = { NotificationPostingService: Pick<NotificationPostingService, "post"> };

type Drafting<P> = (event: IDomainEvent, payload: P) => Option<NotificationDraft>;

function draft(
  userId: string,
  ref: string,
  content: NotificationContent,
  { at, childId }: { at: Date; childId?: string },
): Option<NotificationDraft> {
  return Option.some({ userId, ref, content, at, childId: Option.fromNullable(childId) });
}

function parserOf<S extends z.ZodType>(schema: S) {
  return (payload: unknown): Result<z.infer<S>, string> => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return Result.fail(parsed.error.message);

    return Result.ok(parsed.data);
  };
}

function notifyOn<S extends z.ZodType>(
  eventType: string,
  handlerName: string,
  schema: S,
  drafting: Drafting<z.infer<S>>,
) {
  return onEvent<IDomainEvent, PostingDeps, z.infer<S>>(
    eventType,
    handlerName,
    (deps: PostingDeps) => async (event: IDomainEvent, payload: z.infer<S>) => {
      const drafted = drafting(event, payload);
      if (drafted.isNone()) return Result.ok();

      return deps.NotificationPostingService.post(drafted.unwrap());
    },
    { payload: parserOf(schema) },
  );
}

const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

export const notifyOnReminderSent = notifyOn(
  EventTypes.ALERT_SENT,
  "notifications-reminder-sent",
  PayloadByEventType[EventTypes.ALERT_SENT],
  (event, { userId, eventId, group }) => {
    const content: NotificationContent =
      group.size === 1
        ? { kind: "deadline_reminder", eventId }
        : { kind: "deadline_reminders", count: group.size };

    return draft(userId, notificationRef.reminders(group.key), content, {
      at: event.dateOccurred,
    });
  },
);

export const notifyOnWeeklyDigestSent = notifyOn(
  EventTypes.WEEKLY_DIGEST_SENT,
  "notifications-weekly-digest-sent",
  PayloadByEventType[EventTypes.WEEKLY_DIGEST_SENT],
  (event, { userId, digestId, deadlines, weekStart }) =>
    draft(
      userId,
      notificationRef.weeklyDigest(digestId),
      { kind: "weekly_digest", deadlines, weekStart },
      { at: event.dateOccurred },
    ),
);

export const notifyOnAccessLossSent = notifyOn(
  EventTypes.ACCESS_LOSS_ALERT_SENT,
  "notifications-access-loss-sent",
  PayloadByEventType[EventTypes.ACCESS_LOSS_ALERT_SENT],
  (event, { userId, childId, accessAlertId }) =>
    draft(
      userId,
      notificationRef.accessLoss(accessAlertId),
      { kind: "access_lost" },
      { at: event.dateOccurred, childId },
    ),
);

export const notifyOnNewDeadlines = notifyOn(
  EventTypes.ANNOUNCEMENT_SYNCED,
  "notifications-new-deadlines",
  PayloadByEventType[EventTypes.ANNOUNCEMENT_SYNCED],
  (event, { userId, childId, eventsCreated }) => {
    if (eventsCreated === 0) return Option.none();

    const at = event.dateOccurred;
    return draft(
      userId,
      `new-deadlines:${childId}:${at.toISOString()}`,
      { kind: "new_deadlines", count: eventsCreated },
      { at, childId },
    );
  },
);

export const notifyOnDeadlineAmended = notifyOn(
  EventTypes.EVENT_FLAGGED,
  "notifications-deadline-amended",
  PayloadByEventType[EventTypes.EVENT_FLAGGED],
  (event, { userId, childId, eventId, reason, amendingAnnouncementId }) =>
    draft(
      userId,
      `amended:${eventId}:${amendingAnnouncementId}`,
      { kind: "deadline_amended", eventId, reason },
      { at: event.dateOccurred, childId },
    ),
);

export const notifyOnDateToCheck = notifyOn(
  EventTypes.EVENT_CREATED,
  "notifications-date-to-check",
  PayloadByEventType[EventTypes.EVENT_CREATED],
  (event, { userId, childId, eventId, needsReview }) => {
    if (!needsReview) return Option.none();

    const at = event.dateOccurred;
    return draft(
      userId,
      `to-check:${childId}:${utcDay(at)}`,
      { kind: "dates_to_check", eventIds: [eventId] },
      { at, childId },
    );
  },
);

export const notifyOnSchoolAllowed = notifyOn(
  EventTypes.CHILD_CONNECTED,
  "notifications-school-allowed",
  PayloadByEventType[EventTypes.CHILD_CONNECTED],
  (event, { userId, childId, restoredFrom }) => {
    if (restoredFrom !== "school_blocked") return Option.none();

    const at = event.dateOccurred;
    return draft(
      userId,
      `school-allowed:${childId}:${at.toISOString()}`,
      { kind: "school_allowed" },
      { at, childId },
    );
  },
);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { DIGEST_ENABLED_BY_DEFAULT } from "@modules/alerts/application/ports/digest-audience.port";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { pushSubscription } from "@modules/alerts/schemas/push-subscription.schema";
import {
  alertDefaultReminders,
  alertEventReminders,
} from "@modules/alerts/schemas/reminder-settings.schema";
import {
  alertDigestPreference,
  alertWeeklyDigest,
} from "@modules/alerts/schemas/weekly-digest.schema";
import { calendarFeed } from "@modules/calendar-feed/schemas/calendar-feed.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seenAnnouncement } from "@modules/classroom-sync/schemas/seen-announcement.schema";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, asc, count, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import type { UserDataSnapshot } from "../modules/rgpd/application/dto/user-data-export.dto";
import type { IUserDataReader } from "../modules/rgpd/application/ports/user-data-reader.port";

const queryFailure = dbOperationFailure("DATA_EXPORT_PROVIDER_FAILURE");

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function endpointHost(endpoint: string): string {
  return URL.canParse(endpoint) ? new URL(endpoint).host : "";
}

export class UserDataQuery implements IUserDataReader {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async collect(userId: string): Promise<Result<UserDataSnapshot, AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "UserDataQuery > collect" }, async () => {
      try {
        const children = await exec
          .select()
          .from(childAccount)
          .where(eq(childAccount.userId, userId))
          .orderBy(asc(childAccount.connectedAt));

        const events = await exec
          .select({ event: agendaEvent, reminders: alertEventReminders.reminders })
          .from(agendaEvent)
          .leftJoin(
            alertEventReminders,
            and(
              eq(alertEventReminders.eventId, agendaEvent.id),
              eq(alertEventReminders.userId, userId),
            ),
          )
          .where(eq(agendaEvent.userId, userId))
          .orderBy(asc(agendaEvent.deadlineAt));

        const [defaults] = await exec
          .select({ reminders: alertDefaultReminders.reminders })
          .from(alertDefaultReminders)
          .where(eq(alertDefaultReminders.userId, userId));

        const alerts = await exec
          .select({
            eventId: alert.eventId,
            reminder: alert.reminder,
            dueAt: alert.dueAt,
            status: alert.status,
            sentAt: alert.sentAt,
          })
          .from(alert)
          .where(eq(alert.userId, userId))
          .orderBy(asc(alert.dueAt));

        const subscriptions = await exec
          .select({ endpoint: pushSubscription.endpoint, createdAt: pushSubscription.createdAt })
          .from(pushSubscription)
          .where(eq(pushSubscription.userId, userId))
          .orderBy(asc(pushSubscription.createdAt));

        const [feed] = await exec
          .select({
            childIds: calendarFeed.childIds,
            createdAt: calendarFeed.createdAt,
            rotatedAt: calendarFeed.rotatedAt,
            lastFetchedAt: calendarFeed.lastFetchedAt,
          })
          .from(calendarFeed)
          .where(eq(calendarFeed.userId, userId));

        const [digestChoice] = await exec
          .select({
            enabled: alertDigestPreference.enabled,
            updatedAt: alertDigestPreference.updatedAt,
          })
          .from(alertDigestPreference)
          .where(eq(alertDigestPreference.userId, userId));

        const digestWeeks = await exec
          .select({
            weekStart: alertWeeklyDigest.weekStart,
            status: alertWeeklyDigest.status,
            channel: alertWeeklyDigest.channel,
            sentAt: alertWeeklyDigest.sentAt,
          })
          .from(alertWeeklyDigest)
          .where(eq(alertWeeklyDigest.userId, userId))
          .orderBy(asc(alertWeeklyDigest.weekStart));

        const seen = await exec
          .select({ childId: seenAnnouncement.childId, total: count() })
          .from(seenAnnouncement)
          .innerJoin(
            childAccount,
            and(eq(childAccount.id, seenAnnouncement.childId), eq(childAccount.userId, userId)),
          )
          .groupBy(seenAnnouncement.childId);

        return Result.ok({
          children: children.map((child) => ({
            id: child.id,
            label: child.label,
            googleEmail: child.googleEmail,
            color: child.color,
            avatarUrl: child.avatarUrl,
            status: child.status,
            connectedAt: child.connectedAt.toISOString(),
            lastSyncedAt: iso(child.lastSyncedAt),
          })),
          events: events.map(({ event, reminders }) => ({
            id: event.id,
            childId: event.childId,
            source: event.source,
            courseId: event.courseId,
            announcementUrl: event.announcementUrl,
            title: event.title,
            description: event.description,
            category: event.category,
            deadlineDate: event.deadlineDate,
            deadlineTime: event.deadlineTime,
            deadlineAt: event.deadlineAt.toISOString(),
            receivedAt: event.receivedAt.toISOString(),
            status: event.status,
            done: event.done,
            editedAt: iso(event.editedAt),
            editedFields: event.editedFields,
            deletedAt: iso(event.deletedAt),
            withdrawnAt: iso(event.withdrawnAt),
            createdAt: event.createdAt.toISOString(),
            reminders,
          })),
          defaultReminders: defaults?.reminders ?? null,
          alerts: alerts.map((row) => ({
            ...row,
            dueAt: row.dueAt.toISOString(),
            sentAt: iso(row.sentAt),
          })),
          pushSubscriptions: subscriptions.map((row) => ({
            endpointHost: endpointHost(row.endpoint),
            createdAt: row.createdAt.toISOString(),
          })),
          calendarFeed: feed
            ? {
                childIds: feed.childIds,
                createdAt: feed.createdAt.toISOString(),
                rotatedAt: iso(feed.rotatedAt),
                lastFetchedAt: iso(feed.lastFetchedAt),
              }
            : null,
          weeklyDigest: {
            enabled: digestChoice?.enabled ?? DIGEST_ENABLED_BY_DEFAULT,
            chosenAt: iso(digestChoice?.updatedAt ?? null),
            weeks: digestWeeks.map((week) => ({ ...week, sentAt: iso(week.sentAt) })),
          },
          sync: children.map((child) => ({
            childId: child.id,
            status: child.status,
            reconnectCause: child.cause,
            lastSyncedAt: iso(child.lastSyncedAt),
            nextSyncAt: child.nextSyncAt.toISOString(),
            lastSyncRequestedAt: iso(child.lastSyncRequestedAt),
            announcementsSeen: seen.find((row) => row.childId === child.id)?.total ?? 0,
          })),
        });
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("collect", err));
      }
    });
  }
}

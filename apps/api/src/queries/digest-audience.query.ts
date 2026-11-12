import { alertableEvent } from "@modules/agenda/schemas/alertable-event";
import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import {
  DIGEST_ENABLED_BY_DEFAULT,
  type DigestWeek,
  type IDigestAudience,
} from "@modules/alerts/application/ports/digest-audience.port";
import {
  alertDigestPreference,
  alertWeeklyDigest,
} from "@modules/alerts/schemas/weekly-digest.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { type AppError, type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  dbOperationFailure,
  eq,
  exists,
  not,
  notExists,
  notInArray,
  resolveExecutor,
} from "@packages/drizzle";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

function deadlineWithin(week: DigestWeek) {
  return db
    .select({ id: agendaEvent.id })
    .from(agendaEvent)
    .innerJoin(
      childAccount,
      and(
        eq(childAccount.id, agendaEvent.childId),
        eq(childAccount.userId, authSchema.user.id),
        not(eq(childAccount.status, "disconnecting")),
      ),
    )
    .where(
      and(
        eq(agendaEvent.userId, authSchema.user.id),
        alertableEvent(db, { from: week.from, until: week.to }),
      ),
    );
}

function againstDefault() {
  return db
    .select({ userId: alertDigestPreference.userId })
    .from(alertDigestPreference)
    .where(
      and(
        eq(alertDigestPreference.userId, authSchema.user.id),
        eq(alertDigestPreference.enabled, !DIGEST_ENABLED_BY_DEFAULT),
      ),
    );
}

function receivesDigest() {
  return DIGEST_ENABLED_BY_DEFAULT ? notExists(againstDefault()) : exists(againstDefault());
}

function planned(week: DigestWeek) {
  return db
    .select({ userId: alertWeeklyDigest.userId })
    .from(alertWeeklyDigest)
    .where(eq(alertWeeklyDigest.weekStart, week.weekStart));
}

export class DigestAudienceQuery implements IDigestAudience {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async awaiting(week: DigestWeek, limit: number): Promise<Result<string[], AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DigestAudienceQuery > awaiting" }, async () => {
      try {
        const query = exec
          .select({ userId: authSchema.user.id })
          .from(authSchema.user)
          .where(
            and(
              exists(deadlineWithin(week)),
              receivesDigest(),
              notInArray(authSchema.user.id, planned(week)),
            ),
          )
          .limit(limit);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok(rows.map(({ userId }) => userId));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("awaiting", err));
      }
    });
  }

  async emailOf(userId: string): Promise<Result<Option<string>, AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DigestAudienceQuery > emailOf" }, async () => {
      try {
        const query = exec
          .select({ email: authSchema.user.email })
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId))
          .limit(1);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok(Option.fromNullable(rows[0]).map(({ email }) => email));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("emailOf", err));
      }
    });
  }
}

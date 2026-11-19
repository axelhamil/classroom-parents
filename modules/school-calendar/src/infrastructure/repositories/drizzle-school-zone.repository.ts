import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import { schoolZonePreference } from "../../../schemas/school-calendar.schema";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type { ISchoolZoneRepository } from "../../application/ports/school-zone-repository.port";
import { SchoolZone, schoolZoneSchema } from "../../domain/value-objects/school-zone.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("SCHOOL_CALENDAR_PROVIDER_FAILURE");

interface Query<T> {
  toSQL(): { sql: string };
  execute(): Promise<T>;
}

export class DrizzleSchoolZoneRepository implements ISchoolZoneRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async zoneOf(userId: string): Promise<Result<Option<SchoolZone>, SchoolCalendarError>> {
    const exec = resolveExecutor();
    return this.guarded("zoneOf", async () => {
      const rows = await this.run(
        exec
          .select({ zone: schoolZonePreference.zone })
          .from(schoolZonePreference)
          .where(eq(schoolZonePreference.userId, userId))
          .limit(1),
      );
      const row = rows[0];
      if (!row) return Result.ok(Option.none());

      return this.zoneFrom(userId, row.zone).map((zone) => Option.some(zone));
    });
  }

  async save(
    userId: string,
    zone: SchoolZone,
    at: Date,
  ): Promise<Result<void, SchoolCalendarError>> {
    const exec = resolveExecutor();
    return this.guarded("save", async () => {
      const values = { zone: zone.value, updatedAt: at };
      await this.run(
        exec
          .insert(schoolZonePreference)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: schoolZonePreference.userId, set: values }),
      );
      return Result.ok();
    });
  }

  async clear(userId: string): Promise<Result<void, SchoolCalendarError>> {
    const exec = resolveExecutor();
    return this.guarded("clear", async () => {
      await this.run(
        exec.delete(schoolZonePreference).where(eq(schoolZonePreference.userId, userId)),
      );
      return Result.ok();
    });
  }

  private zoneFrom(userId: string, stored: string): Result<SchoolZone, SchoolCalendarError> {
    const parsed = schoolZoneSchema.safeParse(stored);
    const zone = parsed.success ? SchoolZone.create(parsed.data) : undefined;
    if (zone?.isSuccess) return Result.ok(zone.getValue());

    const corrupt = new Error(`school zone of ${userId} is unknown: ${stored}`);
    this.instrumentation.capture(corrupt);
    return Result.fail(repositoryFailure("zoneOf", corrupt));
  }

  private run<T>(query: Query<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
      () => query.execute(),
    );
  }

  private guarded<T>(
    method: string,
    work: () => Promise<Result<T, SchoolCalendarError>>,
  ): Promise<Result<T, SchoolCalendarError>> {
    return this.instrumentation.startSpan(
      { name: `DrizzleSchoolZoneRepository > ${method}` },
      async () => {
        try {
          return await work();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }
}

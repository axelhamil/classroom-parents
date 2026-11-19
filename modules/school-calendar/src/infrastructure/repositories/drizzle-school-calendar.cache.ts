import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import { z } from "zod";
import { schoolCalendarCache } from "../../../schemas/school-calendar.schema";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type {
  Cached,
  ISchoolCalendarCache,
} from "../../application/ports/school-calendar-cache.port";
import type {
  BankHoliday,
  SchoolHoliday,
} from "../../application/ports/school-calendar-source.port";
import type { BankHolidayTerritory, SchoolZone } from "../../domain/value-objects/school-zone.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("SCHOOL_CALENDAR_PROVIDER_FAILURE");

const holidaysSchema = z.array(
  z.object({ name: z.string(), startsOn: z.iso.date(), endsOn: z.iso.date() }),
);

const bankHolidaysSchema = z.array(z.object({ date: z.iso.date(), name: z.string() }));

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

const holidaysKey = (zone: SchoolZone, schoolYear: string) =>
  `holidays:${zone.value}:${schoolYear}`;

const bankHolidaysKey = (territory: BankHolidayTerritory, year: number) =>
  `bank-holidays:${territory}:${year}`;

export class DrizzleSchoolCalendarCache implements ISchoolCalendarCache {
  constructor(private readonly instrumentation: IInstrumentation) {}

  holidays(zone: SchoolZone, schoolYear: string): Outcome<Option<Cached<SchoolHoliday>>> {
    return this.read("holidays", holidaysKey(zone, schoolYear), holidaysSchema);
  }

  saveHolidays(
    zone: SchoolZone,
    schoolYear: string,
    entries: SchoolHoliday[],
    at: Date,
  ): Outcome<void> {
    return this.write("saveHolidays", holidaysKey(zone, schoolYear), entries, at);
  }

  bankHolidays(
    territory: BankHolidayTerritory,
    year: number,
  ): Outcome<Option<Cached<BankHoliday>>> {
    return this.read("bankHolidays", bankHolidaysKey(territory, year), bankHolidaysSchema);
  }

  saveBankHolidays(
    territory: BankHolidayTerritory,
    year: number,
    entries: BankHoliday[],
    at: Date,
  ): Outcome<void> {
    return this.write("saveBankHolidays", bankHolidaysKey(territory, year), entries, at);
  }

  private async read<T>(
    method: string,
    key: string,
    schema: z.ZodType<T[]>,
  ): Outcome<Option<Cached<T>>> {
    const exec = resolveExecutor();
    return this.guarded(method, async () => {
      const query = exec
        .select({ entries: schoolCalendarCache.entries, fetchedAt: schoolCalendarCache.fetchedAt })
        .from(schoolCalendarCache)
        .where(eq(schoolCalendarCache.key, key))
        .limit(1);
      const rows = await this.instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );
      const row = rows[0];
      if (!row) return Result.ok(Option.none());

      const entries = schema.safeParse(row.entries);
      if (!entries.success) {
        this.instrumentation.capture(entries.error);
        return Result.fail(repositoryFailure(method, entries.error));
      }
      return Result.ok(Option.some({ entries: entries.data, fetchedAt: row.fetchedAt }));
    });
  }

  private async write(method: string, key: string, entries: unknown[], at: Date): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded(method, async () => {
      const values = { entries, fetchedAt: at };
      const query = exec
        .insert(schoolCalendarCache)
        .values({ key, ...values })
        .onConflictDoUpdate({ target: schoolCalendarCache.key, set: values });
      await this.instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );
      return Result.ok();
    });
  }

  private guarded<T>(method: string, work: () => Outcome<T>): Outcome<T> {
    return this.instrumentation.startSpan(
      { name: `DrizzleSchoolCalendarCache > ${method}` },
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

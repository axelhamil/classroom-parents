import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, asc, eq, resolveExecutor } from "@packages/drizzle";
import { schoolHolidayPeriod } from "../../../schemas/school-calendar.schema";
import type {
  IOwnPeriodRepository,
  StoredPeriod,
} from "../../application/ports/own-period-repository.port";
import type { OwnPeriod, OwnPeriodOrigin } from "../../domain/calendar/own-period.vo";
import { InstrumentedRepository, type Outcome } from "./instrumented-repository";

type PeriodRow = typeof schoolHolidayPeriod.$inferSelect;

const ORIGINS: ReadonlySet<string> = new Set<OwnPeriodOrigin>(["ics", "manual"]);

function isOrigin(value: string): value is OwnPeriodOrigin {
  return ORIGINS.has(value);
}

function storedOf({ id, name, startsOn, endsOn, origin }: PeriodRow): StoredPeriod {
  return { id, name, startsOn, endsOn, origin: isOrigin(origin) ? origin : "manual" };
}

export class DrizzleOwnPeriodRepository
  extends InstrumentedRepository
  implements IOwnPeriodRepository
{
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzleOwnPeriodRepository");
  }

  async periodsOf(userId: string): Outcome<StoredPeriod[]> {
    const exec = resolveExecutor();
    return this.guarded("periodsOf", async () => {
      const rows = await this.run(
        exec
          .select()
          .from(schoolHolidayPeriod)
          .where(eq(schoolHolidayPeriod.userId, userId))
          .orderBy(asc(schoolHolidayPeriod.startsOn), asc(schoolHolidayPeriod.endsOn)),
      );
      return Result.ok(rows.map(storedOf));
    });
  }

  async add(userId: string, period: OwnPeriod, at: Date): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("add", async () => {
      await this.run(
        exec
          .insert(schoolHolidayPeriod)
          .values({ userId, ...period.value, origin: "manual", createdAt: at }),
      );
      return Result.ok();
    });
  }

  async replaceImported(userId: string, periods: OwnPeriod[], at: Date): Outcome<number> {
    const exec = resolveExecutor();
    return this.guarded("replaceImported", async () => {
      await this.run(
        exec
          .delete(schoolHolidayPeriod)
          .where(
            and(eq(schoolHolidayPeriod.userId, userId), eq(schoolHolidayPeriod.origin, "ics")),
          ),
      );
      if (periods.length === 0) return Result.ok(0);

      await this.run(
        exec
          .insert(schoolHolidayPeriod)
          .values(periods.map(({ value }) => ({ userId, ...value, origin: "ics", createdAt: at }))),
      );
      return Result.ok(periods.length);
    });
  }

  async remove(userId: string, periodId: string): Outcome<Option<StoredPeriod>> {
    const exec = resolveExecutor();
    return this.guarded("remove", async () => {
      const rows = await this.run(
        exec
          .delete(schoolHolidayPeriod)
          .where(and(eq(schoolHolidayPeriod.id, periodId), eq(schoolHolidayPeriod.userId, userId)))
          .returning(),
      );
      return Result.ok(Option.fromNullable(rows[0]).map(storedOf));
    });
  }
}

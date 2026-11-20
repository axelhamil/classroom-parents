import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { eq, resolveExecutor } from "@packages/drizzle";
import { z } from "zod";
import { schoolCalendarCache } from "../../../schemas/school-calendar.schema";
import type {
  Cached,
  ISchoolCalendarCache,
} from "../../application/ports/school-calendar-cache.port";
import type { Region } from "../../application/ports/school-calendar-source.port";
import type { CalendarEntry } from "../../domain/calendar/calendar-feed";
import { InstrumentedRepository, type Outcome } from "./instrumented-repository";

const namesSchema = z.record(z.string(), z.string());

const entriesSchema = z.array(
  z.object({
    names: namesSchema,
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    regions: z.array(z.string()).nullable(),
  }),
);

const regionsSchema = z.array(z.object({ code: z.string(), names: namesSchema }));

export class DrizzleSchoolCalendarCache
  extends InstrumentedRepository
  implements ISchoolCalendarCache
{
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzleSchoolCalendarCache");
  }

  entries(key: string): Outcome<Option<Cached<CalendarEntry>>> {
    return this.read("entries", key, entriesSchema);
  }

  saveEntries(key: string, entries: CalendarEntry[], at: Date): Outcome<void> {
    return this.write("saveEntries", key, entries, at);
  }

  regions(key: string): Outcome<Option<Cached<Region>>> {
    return this.read("regions", key, regionsSchema);
  }

  saveRegions(key: string, regions: Region[], at: Date): Outcome<void> {
    return this.write("saveRegions", key, regions, at);
  }

  private async read<T>(
    method: string,
    key: string,
    schema: z.ZodType<T[]>,
  ): Outcome<Option<Cached<T>>> {
    const exec = resolveExecutor();
    return this.guarded(method, async () => {
      const rows = await this.run(
        exec
          .select({
            entries: schoolCalendarCache.entries,
            fetchedAt: schoolCalendarCache.fetchedAt,
          })
          .from(schoolCalendarCache)
          .where(eq(schoolCalendarCache.key, key))
          .limit(1),
      );
      const row = rows[0];
      if (!row) return Result.ok(Option.none());

      const entries = schema.safeParse(row.entries);
      if (!entries.success) return this.corrupt(method, `cache ${key}: ${entries.error.message}`);

      return Result.ok(Option.some({ entries: entries.data, fetchedAt: row.fetchedAt }));
    });
  }

  private async write(method: string, key: string, entries: unknown[], at: Date): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded(method, async () => {
      const values = { entries, fetchedAt: at };
      await this.run(
        exec
          .insert(schoolCalendarCache)
          .values({ key, ...values })
          .onConflictDoUpdate({ target: schoolCalendarCache.key, set: values }),
      );
      return Result.ok();
    });
  }
}

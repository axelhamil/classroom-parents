import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import type { BankHolidayTerritory, SchoolZone } from "../../domain/value-objects/school-zone.vo";
import { CACHE_FRESHNESS_MS } from "../config/cache-freshness";
import { calendarUnavailable, type SchoolCalendarError } from "../errors/school-calendar-errors";
import type { Cached, ISchoolCalendarCache } from "../ports/school-calendar-cache.port";
import type {
  BankHoliday,
  ISchoolCalendarSource,
  SchoolHoliday,
} from "../ports/school-calendar-source.port";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

interface CachedSlice<T> {
  read(): Outcome<Option<Cached<T>>>;
  fetch(): Outcome<T[]>;
  save(entries: T[], at: Date): Outcome<void>;
}

export class OfficialCalendarService {
  constructor(
    private readonly source: ISchoolCalendarSource,
    private readonly cache: ISchoolCalendarCache,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async holidays(zone: SchoolZone, schoolYears: string[]): Outcome<SchoolHoliday[]> {
    return this.span("holidays", () =>
      this.collect(schoolYears, (schoolYear) => ({
        read: () => this.cache.holidays(zone, schoolYear),
        fetch: () => this.source.holidays(zone, schoolYear),
        save: (entries, at) => this.cache.saveHolidays(zone, schoolYear, entries, at),
      })),
    );
  }

  async bankHolidays(territory: BankHolidayTerritory, years: number[]): Outcome<BankHoliday[]> {
    return this.span("bankHolidays", () =>
      this.collect(years, (year) => ({
        read: () => this.cache.bankHolidays(territory, year),
        fetch: () => this.source.bankHolidays(territory, year),
        save: (entries, at) => this.cache.saveBankHolidays(territory, year, entries, at),
      })),
    );
  }

  private async collect<K, T>(keys: K[], sliceOf: (key: K) => CachedSlice<T>): Outcome<T[]> {
    const slices = await Promise.all(keys.map((key) => this.entriesOf(sliceOf(key))));
    const failed = slices.find((slice) => slice.isFailure);
    if (failed) return Result.fail(failed.getError());

    return Result.ok(slices.flatMap((slice) => slice.getValue()));
  }

  private async entriesOf<T>(slice: CachedSlice<T>): Outcome<T[]> {
    const now = this.clock();
    const cached = await this.cachedOrNone(slice);
    const fresh = cached.filter(({ fetchedAt }) => this.isFresh(fetchedAt, now));
    if (fresh.isSome()) return Result.ok(fresh.unwrap().entries);

    const fetched = await slice.fetch();
    if (fetched.isSuccess) {
      await slice.save(fetched.getValue(), now);
      return fetched;
    }

    return cached.map(({ entries }) => entries).toResult(calendarUnavailable);
  }

  private async cachedOrNone<T>(slice: CachedSlice<T>): Promise<Option<Cached<T>>> {
    const cached = await slice.read();

    return cached.isSuccess ? cached.getValue() : Option.none();
  }

  private isFresh(fetchedAt: Date, now: Date): boolean {
    return now.getTime() - fetchedAt.getTime() < CACHE_FRESHNESS_MS;
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `OfficialCalendarService > ${method}`, op: "function" },
      work,
    );
  }
}

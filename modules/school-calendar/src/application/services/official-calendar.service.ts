import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  type CalendarEntry,
  type CalendarFeed,
  feedKey,
} from "../../domain/calendar/calendar-feed";
import { CACHE_FRESHNESS_MS } from "../config/cache-freshness";
import { calendarUnavailable, type SchoolCalendarError } from "../errors/school-calendar-errors";
import type { Cached, ISchoolCalendarCache } from "../ports/school-calendar-cache.port";
import type { ISchoolCalendarSource, Region } from "../ports/school-calendar-source.port";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

interface CachedSlice<T> {
  read(): Outcome<Option<Cached<T>>>;
  fetch(): Outcome<T[]>;
  save(entries: T[], at: Date): Outcome<void>;
}

/**
 * Reads the official calendars through the cache: a copy younger than a week is served, an older
 * one is refetched, and when the source fails the last copy is served however old.
 */
export class OfficialCalendarService {
  constructor(
    private readonly source: ISchoolCalendarSource,
    private readonly cache: ISchoolCalendarCache,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async entries(feed: CalendarFeed, periods: string[]): Outcome<CalendarEntry[][]> {
    return this.span("entries", async () => {
      const slices = await Promise.all(
        periods.map((period) => this.entriesOf(this.feedSlice(feed, period))),
      );
      const failed = slices.find((slice) => slice.isFailure);
      if (failed) return Result.fail(failed.getError());

      return Result.ok(slices.map((slice) => slice.getValue()));
    });
  }

  async regions(country: string): Outcome<Region[]> {
    const key = `openholidays:regions:${country}`;

    return this.span("regions", () =>
      this.entriesOf({
        read: () => this.cache.regions(key),
        fetch: () => this.source.regions(country),
        save: (regions, at) => this.cache.saveRegions(key, regions, at),
      }),
    );
  }

  private feedSlice(feed: CalendarFeed, period: string): CachedSlice<CalendarEntry> {
    const key = feedKey(feed, period);

    return {
      read: () => this.cache.entries(key),
      fetch: () => this.source.entries(feed, period),
      save: (entries, at) => this.cache.saveEntries(key, entries, at),
    };
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

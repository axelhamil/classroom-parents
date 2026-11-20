import { type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  type CalendarEntry,
  type CalendarFeed,
  feedPeriods,
  nameIn,
} from "../../domain/calendar/calendar-feed";
import type { SchoolCalendarChoice } from "../../domain/calendar/school-calendar-choice.vo";
import type { DateRange } from "../../domain/value-objects/date-range.vo";
import type { BankHolidayDto, HolidayDto } from "../dto/school-calendar.dto";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";
import type { IOwnPeriodRepository } from "../ports/own-period-repository.port";
import type { OfficialCalendarService } from "./official-calendar.service";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

export interface SchoolHolidays {
  holidays: HolidayDto[];
  covered: boolean;
}

interface Reading {
  choice: SchoolCalendarChoice;
  range: DateRange;
  language: string;
}

const NOT_COVERED: SchoolHolidays = { holidays: [], covered: false };

function byStart(left: HolidayDto, right: HolidayDto): number {
  return left.startsOn.localeCompare(right.startsOn) || left.endsOn.localeCompare(right.endsOn);
}

function distinctBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [keyOf(item), item])).values()];
}

/** The holidays and bank holidays a calendar choice gives over a range, in the parent's language. */
export class HolidayReader {
  constructor(
    private readonly official: Pick<OfficialCalendarService, "entries">,
    private readonly periods: IOwnPeriodRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async schoolHolidays(userId: string | null, reading: Reading): Outcome<SchoolHolidays> {
    return this.span("schoolHolidays", async () => {
      if (reading.choice.source() === "own") return this.ownHolidays(userId, reading.range);

      const feed = reading.choice.schoolHolidayFeed();
      if (feed.isNone()) return Result.ok(NOT_COVERED);

      return (await this.applicableSlices(feed.unwrap(), reading)).map((slices) => ({
        holidays: this.holidaysOf(slices.flat(), reading),
        covered: slices.every((slice) => slice.length > 0),
      }));
    });
  }

  async bankHolidays(reading: Reading): Outcome<BankHolidayDto[]> {
    return this.span("bankHolidays", async () => {
      const feed = reading.choice.bankHolidayFeed();
      if (feed.isNone()) return Result.ok([]);

      return (await this.applicableSlices(feed.unwrap(), reading)).map((slices) =>
        distinctBy(
          slices
            .flat()
            .filter(({ startsOn }) => reading.range.contains(startsOn))
            .map((entry) => ({
              date: entry.startsOn,
              name: nameIn(entry.names, reading.language),
            })),
          ({ date }) => date,
        ).sort((left, right) => left.date.localeCompare(right.date)),
      );
    });
  }

  private async ownHolidays(userId: string | null, range: DateRange): Outcome<SchoolHolidays> {
    if (userId === null) return Result.ok(NOT_COVERED);

    return (await this.periods.periodsOf(userId)).map((periods) => {
      const holidays = periods
        .filter(({ startsOn, endsOn }) => range.overlaps(startsOn, endsOn))
        .map(({ name, startsOn, endsOn }) => ({ name, startsOn, endsOn }))
        .sort(byStart);

      return { holidays, covered: periods.length > 0 };
    });
  }

  private async applicableSlices(feed: CalendarFeed, reading: Reading): Outcome<CalendarEntry[][]> {
    const slices = await this.official.entries(feed, feedPeriods(feed, reading.range));

    return slices.map((all) =>
      all.map((slice) => slice.filter((entry) => reading.choice.appliesTo(entry))),
    );
  }

  private holidaysOf(entries: CalendarEntry[], { range, language }: Reading): HolidayDto[] {
    const holidays = entries
      .filter(({ startsOn, endsOn }) => range.overlaps(startsOn, endsOn))
      .map((entry) => ({
        name: nameIn(entry.names, language),
        startsOn: entry.startsOn,
        endsOn: entry.endsOn,
      }));

    return distinctBy(holidays, (h) => `${h.name}|${h.startsOn}|${h.endsOn}`).sort(byStart);
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `HolidayReader > ${method}`, op: "function" },
      work,
    );
  }
}

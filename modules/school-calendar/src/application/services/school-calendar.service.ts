import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { ACADEMIES } from "../../domain/academies";
import { DateRange } from "../../domain/value-objects/date-range.vo";
import { SchoolZone, type SchoolZoneValue } from "../../domain/value-objects/school-zone.vo";
import type {
  SchoolCalendarDto,
  SchoolCalendarQuery,
  SchoolZoneDto,
} from "../dto/school-calendar.dto";
import {
  rangeInvalid,
  type SchoolCalendarError,
  zoneInvalid,
} from "../errors/school-calendar-errors";
import type { BankHoliday, SchoolHoliday } from "../ports/school-calendar-source.port";
import type { ISchoolZoneRepository } from "../ports/school-zone-repository.port";
import type { OfficialCalendarService } from "./official-calendar.service";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

type ZoneChoice = Option<SchoolZone>;

const NO_ZONE_CALENDAR: SchoolCalendarDto = { zone: null, holidays: [], bankHolidays: [] };

function byStart(left: SchoolHoliday, right: SchoolHoliday): number {
  return left.startsOn.localeCompare(right.startsOn) || left.endsOn.localeCompare(right.endsOn);
}

function byDate(left: BankHoliday, right: BankHoliday): number {
  return left.date.localeCompare(right.date);
}

function zoneValueOf(choice: ZoneChoice): SchoolZoneValue | null {
  return choice.map(({ value }) => value).toNull();
}

function sameChoice(left: ZoneChoice, right: ZoneChoice): boolean {
  return left.equals(right, (a, b) => a.equals(b));
}

export class SchoolCalendarService {
  constructor(
    private readonly zones: ISchoolZoneRepository,
    private readonly official: Pick<OfficialCalendarService, "holidays" | "bankHolidays">,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async calendar(userId: string, query: SchoolCalendarQuery): Outcome<SchoolCalendarDto> {
    return this.span("calendar", async () => {
      const range = DateRange.create(query);
      if (range.isFailure) return Result.fail(rangeInvalid(range.getError()));

      const zone = await this.zones.zoneOf(userId);
      if (zone.isFailure) return Result.fail(zone.getError());
      if (zone.getValue().isNone()) return Result.ok(NO_ZONE_CALENDAR);

      return this.calendarOf(zone.getValue().unwrap(), range.getValue());
    });
  }

  async zone(userId: string): Outcome<SchoolZoneDto> {
    return this.span("zone", async () =>
      (await this.zones.zoneOf(userId)).map((zone) => ({
        zone: zoneValueOf(zone),
        academies: ACADEMIES,
      })),
    );
  }

  async setZone(userId: string, zoneValue: SchoolZoneValue | null): Outcome<SchoolZoneDto> {
    return this.span("setZone", async () => {
      const choice = this.choiceOf(zoneValue);
      if (choice.isFailure) return Result.fail(choice.getError());

      const saved = await this.transactions.run(() => this.store(userId, choice.getValue()));
      if (saved.isFailure) return Result.fail(saved.getError());

      return Result.ok({ zone: zoneValueOf(choice.getValue()), academies: ACADEMIES });
    });
  }

  private async calendarOf(zone: SchoolZone, range: DateRange): Outcome<SchoolCalendarDto> {
    const holidays = await this.official.holidays(zone, range.schoolYears());
    if (holidays.isFailure) return Result.fail(holidays.getError());

    const bankHolidays = await this.official.bankHolidays(
      zone.bankHolidayTerritory(),
      range.calendarYears(),
    );
    if (bankHolidays.isFailure) return Result.fail(bankHolidays.getError());

    return Result.ok({
      zone: zone.value,
      holidays: holidays
        .getValue()
        .filter(({ startsOn, endsOn }) => range.overlaps(startsOn, endsOn))
        .sort(byStart),
      bankHolidays: bankHolidays
        .getValue()
        .filter(({ date }) => range.contains(date))
        .sort(byDate),
    });
  }

  private choiceOf(zoneValue: SchoolZoneValue | null): Result<ZoneChoice, SchoolCalendarError> {
    if (zoneValue === null) return Result.ok(Option.none());

    return SchoolZone.create(zoneValue)
      .map((zone) => Option.some(zone))
      .mapError(() => zoneInvalid);
  }

  private async store(userId: string, choice: ZoneChoice): Outcome<void> {
    const current = await this.zones.zoneOf(userId);
    if (current.isFailure) return Result.fail(current.getError());
    if (sameChoice(current.getValue(), choice)) return Result.ok();

    const written = choice.isSome()
      ? await this.zones.save(userId, choice.unwrap(), this.clock())
      : await this.zones.clear(userId);
    if (written.isFailure) return Result.fail(written.getError());

    await emitEvent(this.outbox, EventTypes.SCHOOL_ZONE_CHANGED, "user", userId, {
      userId,
      zone: zoneValueOf(choice),
    });
    return Result.ok();
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `SchoolCalendarService > ${method}`, op: "function" },
      work,
    );
  }
}

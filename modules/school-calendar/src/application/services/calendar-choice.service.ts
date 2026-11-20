import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { readIcsPeriods } from "../../domain/calendar/ics-periods";
import { OwnPeriod, type OwnPeriodOrigin } from "../../domain/calendar/own-period.vo";
import { SchoolCalendarChoice } from "../../domain/calendar/school-calendar-choice.vo";
import {
  type ChoiceBody,
  type ChoiceDto,
  choiceDtoOf,
  type IcsImportBody,
  type PeriodBody,
} from "../dto/school-calendar.dto";
import {
  choiceInvalid,
  icsInvalid,
  periodInvalid,
  periodNotFound,
  type SchoolCalendarError,
} from "../errors/school-calendar-errors";
import type { IIcsDownloader } from "../ports/ics-downloader.port";
import type { IOwnPeriodRepository } from "../ports/own-period-repository.port";
import type { ISchoolCalendarChoiceRepository } from "../ports/school-calendar-choice-repository.port";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

type Choice = Option<SchoolCalendarChoice>;

type HolidaysChange = "added" | "removed" | "imported";

export interface IcsImportDto {
  imported: number;
  skipped: number;
}

function sameChoice(left: Choice, right: Choice): boolean {
  return left.equals(right, (a, b) => a.equals(b));
}

export class CalendarChoiceService {
  constructor(
    private readonly choices: ISchoolCalendarChoiceRepository,
    private readonly periods: IOwnPeriodRepository,
    private readonly ics: IIcsDownloader,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async choose(userId: string, body: ChoiceBody): Outcome<ChoiceDto | null> {
    return this.span("choose", async () => {
      const choice = this.choiceOf(body);
      if (choice.isFailure) return Result.fail(choice.getError());

      const saved = await this.transactions.run(() => this.storeChoice(userId, choice.getValue()));
      if (saved.isFailure) return Result.fail(saved.getError());

      return Result.ok(choiceDtoOf(choice.getValue()));
    });
  }

  async addPeriod(userId: string, body: PeriodBody): Outcome<void> {
    return this.span("addPeriod", async () => {
      const period = OwnPeriod.create(body);
      if (period.isFailure) return Result.fail(periodInvalid(period.getError()));

      return this.transactions.run(async () => {
        const added = await this.periods.add(userId, period.getValue(), this.clock());
        if (added.isFailure) return Result.fail(added.getError());

        return this.announce(userId, "added", "manual", 1);
      });
    });
  }

  async removePeriod(userId: string, periodId: string): Outcome<void> {
    return this.span("removePeriod", () =>
      this.transactions.run(async () => {
        const removed = await this.periods.remove(userId, periodId);
        if (removed.isFailure) return Result.fail(removed.getError());
        if (removed.getValue().isNone()) return Result.fail(periodNotFound);

        return this.announce(userId, "removed", removed.getValue().unwrap().origin, 1);
      }),
    );
  }

  async importIcs(userId: string, body: IcsImportBody): Outcome<IcsImportDto> {
    return this.span("importIcs", async () => {
      const text: Result<string, SchoolCalendarError> =
        "url" in body ? await this.ics.download(body.url) : Result.ok(body.content);
      if (text.isFailure) return Result.fail(text.getError());

      const reading = readIcsPeriods(text.getValue());
      if (reading.isFailure) return Result.fail(icsInvalid(reading.getError()));

      const { periods, skipped } = reading.getValue();
      const stored = await this.transactions.run(async () => {
        const replaced = await this.periods.replaceImported(userId, periods, this.clock());
        if (replaced.isFailure) return Result.fail(replaced.getError());

        return this.announce(userId, "imported", "ics", periods.length);
      });
      if (stored.isFailure) return Result.fail(stored.getError());

      return Result.ok({ imported: periods.length, skipped });
    });
  }

  private choiceOf(body: ChoiceBody): Result<Choice, SchoolCalendarError> {
    if (body === null) return Result.ok(Option.none());

    return SchoolCalendarChoice.create(body)
      .map((choice) => Option.some(choice))
      .mapError(choiceInvalid);
  }

  private async storeChoice(userId: string, choice: Choice): Outcome<void> {
    const current = await this.choices.choiceOf(userId);
    if (current.isFailure) return Result.fail(current.getError());
    if (sameChoice(current.getValue(), choice)) return Result.ok();

    const written = choice.isSome()
      ? await this.choices.save(userId, choice.unwrap(), this.clock())
      : await this.choices.clear(userId);
    if (written.isFailure) return Result.fail(written.getError());

    const dto = choiceDtoOf(choice);
    await emitEvent(this.outbox, EventTypes.SCHOOL_CALENDAR_CHOICE_CHANGED, "user", userId, {
      userId,
      country: dto?.country ?? null,
      region: dto?.region ?? null,
      source: dto?.source ?? null,
    });
    return Result.ok();
  }

  private async announce(
    userId: string,
    change: HolidaysChange,
    origin: OwnPeriodOrigin,
    periods: number,
  ): Outcome<void> {
    await emitEvent(this.outbox, EventTypes.SCHOOL_HOLIDAYS_EDITED, "user", userId, {
      userId,
      change,
      origin,
      periods,
    });
    return Result.ok();
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `CalendarChoiceService > ${method}`, op: "function" },
      work,
    );
  }
}

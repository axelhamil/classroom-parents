import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { eq, resolveExecutor } from "@packages/drizzle";
import { schoolCalendarChoice } from "../../../schemas/school-calendar.schema";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type { ISchoolCalendarChoiceRepository } from "../../application/ports/school-calendar-choice-repository.port";
import {
  SchoolCalendarChoice,
  schoolCalendarChoiceSchema,
} from "../../domain/calendar/school-calendar-choice.vo";
import { InstrumentedRepository, type Outcome } from "./instrumented-repository";

type ChoiceRow = typeof schoolCalendarChoice.$inferSelect;

export class DrizzleSchoolCalendarChoiceRepository
  extends InstrumentedRepository
  implements ISchoolCalendarChoiceRepository
{
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzleSchoolCalendarChoiceRepository");
  }

  async choiceOf(userId: string): Outcome<Option<SchoolCalendarChoice>> {
    const exec = resolveExecutor();
    return this.guarded("choiceOf", async () => {
      const rows = await this.run(
        exec
          .select()
          .from(schoolCalendarChoice)
          .where(eq(schoolCalendarChoice.userId, userId))
          .limit(1),
      );
      const row = rows[0];
      if (!row) return Result.ok(Option.none());

      return this.choiceFrom(row).map((choice) => Option.some(choice));
    });
  }

  async save(userId: string, choice: SchoolCalendarChoice, at: Date): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("save", async () => {
      const values = { ...choice.value, updatedAt: at };
      await this.run(
        exec
          .insert(schoolCalendarChoice)
          .values({ userId, ...values })
          .onConflictDoUpdate({ target: schoolCalendarChoice.userId, set: values }),
      );
      return Result.ok();
    });
  }

  async clear(userId: string): Outcome<void> {
    const exec = resolveExecutor();
    return this.guarded("clear", async () => {
      await this.run(
        exec.delete(schoolCalendarChoice).where(eq(schoolCalendarChoice.userId, userId)),
      );
      return Result.ok();
    });
  }

  private choiceFrom(row: ChoiceRow): Result<SchoolCalendarChoice, SchoolCalendarError> {
    const parsed = schoolCalendarChoiceSchema.safeParse(row);
    const choice = parsed.success ? SchoolCalendarChoice.create(parsed.data) : undefined;
    if (choice?.isSuccess) return Result.ok(choice.getValue());

    return this.corrupt<SchoolCalendarChoice>(
      "choiceOf",
      `school calendar of ${row.userId} is unknown: ${row.country} ${row.region ?? ""}`,
    );
  }
}

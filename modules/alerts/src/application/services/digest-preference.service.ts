import { type AppError, type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { DigestPreferenceDto } from "../dto/digest-preference.dto";
import { DIGEST_ENABLED_BY_DEFAULT } from "../ports/digest-audience.port";
import type { IWeeklyDigestRepository } from "../ports/weekly-digest-repository.port";

export class DigestPreferenceService {
  constructor(
    private readonly digests: IWeeklyDigestRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async preference(userId: string): Promise<Result<DigestPreferenceDto, AppError>> {
    return this.span("preference", async () =>
      (await this.digests.enabledFor(userId)).map((enabled) => ({
        enabled: enabled.unwrapOr(DIGEST_ENABLED_BY_DEFAULT),
      })),
    );
  }

  async setPreference(
    userId: string,
    enabled: boolean,
  ): Promise<Result<DigestPreferenceDto, AppError>> {
    return this.span("setPreference", () =>
      this.transactions.run(async (): Promise<Result<DigestPreferenceDto, AppError>> => {
        const current = await this.digests.enabledFor(userId);
        if (current.isFailure) return Result.fail(current.getError());
        if (current.getValue().unwrapOr(DIGEST_ENABLED_BY_DEFAULT) === enabled)
          return Result.ok({ enabled });

        const saved = await this.digests.saveEnabled(userId, enabled, this.clock());
        if (saved.isFailure) return Result.fail(saved.getError());

        await emitEvent(this.outbox, EventTypes.WEEKLY_DIGEST_PREFERENCE_CHANGED, "user", userId, {
          userId,
          enabled,
        });
        return Result.ok({ enabled });
      }),
    );
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `DigestPreferenceService > ${method}`, op: "function" },
      work,
    );
  }
}

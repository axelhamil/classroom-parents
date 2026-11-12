import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  type Option,
  Result,
} from "@packages/ddd-kit";
import { DAY_MS } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { UserDataExport } from "../dto/user-data-export.dto";
import type { DataExportAccount, IRgpdRepository, RgpdError } from "../ports/rgpd.port";
import type { IUserDataReader } from "../ports/user-data-reader.port";

export const DATA_EXPORT_COOLDOWN_MS = DAY_MS;

export interface RequestDataExportInput {
  userId: string;
}

export interface RequestDataExportOutput {
  fileName: string;
  document: UserDataExport;
}

function exportFileName(now: Date): string {
  const day = utcToZonedWall(now, PARIS_TIME_ZONE)
    .map((wall) => wall.date)
    .unwrapOr(now.toISOString().slice(0, 10));

  return `classroom-parents-export-${day}.json`;
}

function pendingCooldownEnd(account: DataExportAccount, now: Date): Option<Date> {
  return account.lastDataExportAt
    .map((last) => new Date(last.getTime() + DATA_EXPORT_COOLDOWN_MS))
    .filter((end) => end > now);
}

export class DataExportService {
  constructor(
    private readonly rgpd: IRgpdRepository,
    private readonly reader: IUserDataReader,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async requestExport(
    input: RequestDataExportInput,
  ): Promise<Result<RequestDataExportOutput, RgpdError | AppError>> {
    return this.instrumentation.startSpan(
      { name: "DataExportService > requestExport", op: "function" },
      () =>
        this.transactions.run(async () => {
          const now = this.clock();

          const locked = await this.rgpd.lockDataExportAccount(input.userId);
          if (locked.isFailure) return Result.fail(locked.getError());
          if (locked.getValue().isNone())
            return Result.fail({ code: "ACCOUNT_NOT_FOUND", message: "Compte introuvable." });

          const account = locked.getValue().unwrap();
          const cooldown = pendingCooldownEnd(account, now);
          if (cooldown.isSome())
            return Result.fail({
              code: "DATA_EXPORT_RATE_LIMITED",
              message:
                "Vous avez déjà téléchargé vos données il y a moins de 24 h. Réessayez plus tard.",
              metadata: { retryAt: cooldown.unwrap().toISOString() },
            });

          const marked = await this.rgpd.markDataExported(input.userId, now);
          if (marked.isFailure) return Result.fail(marked.getError());

          const snapshot = await this.reader.collect(input.userId);
          if (snapshot.isFailure) return Result.fail(snapshot.getError());

          await emitEvent(
            this.outbox,
            EventTypes.USER_DATA_EXPORT_REQUESTED,
            "user",
            input.userId,
            { userId: input.userId, requestedAt: now },
            {},
          );

          return Result.ok({
            fileName: exportFileName(now),
            document: {
              format: "classroom-parents-export",
              version: 1,
              exportedAt: now.toISOString(),
              account: {
                name: account.name,
                email: account.email,
                createdAt: account.createdAt.toISOString(),
              },
              ...snapshot.getValue(),
            },
          });
        }),
    );
  }
}

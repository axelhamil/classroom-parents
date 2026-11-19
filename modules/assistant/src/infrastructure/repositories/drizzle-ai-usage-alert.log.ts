import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { resolveExecutor } from "@packages/drizzle";
import { aiUsageAlert } from "../../../schemas/assistant.schema";
import type { AssistantError } from "../../application/errors/assistant-errors";
import type {
  AiUsageAlertKey,
  IAiUsageAlertLog,
} from "../../application/ports/ai-usage-alert-log.port";
import { InstrumentedStore } from "./instrumented-store";

export class DrizzleAiUsageAlertLog extends InstrumentedStore implements IAiUsageAlertLog {
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzleAiUsageAlertLog");
  }

  async claim(key: AiUsageAlertKey): Promise<Result<boolean, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("claim", async () => {
      const inserted = await this.run(
        exec
          .insert(aiUsageAlert)
          .values({ kind: key.kind, period: key.period, userId: key.userId.toNull() })
          .onConflictDoNothing()
          .returning({ id: aiUsageAlert.id }),
      );

      return Result.ok(inserted.length > 0);
    });
  }
}

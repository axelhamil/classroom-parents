import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { dbOperationFailure, resolveExecutor } from "@packages/drizzle";
import { aiCall } from "../../schemas/ai-call.schema";
import type { AiCallEntry, AiCallLogError, IAiCallLog } from "./ai-call-log.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const journalFailure = dbOperationFailure("AI_CALL_LOG_PROVIDER_FAILURE");

/** The `ai_call` journal; joins the ambient unit of work when there is one. */
export class DrizzleAiCallLog implements IAiCallLog {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async record(entry: AiCallEntry): Promise<Result<void, AiCallLogError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleAiCallLog > record" }, async () => {
      try {
        const query = exec.insert(aiCall).values(entry);
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(journalFailure("record", err));
      }
    });
  }
}

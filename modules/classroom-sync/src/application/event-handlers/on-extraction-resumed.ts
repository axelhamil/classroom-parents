import { onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { isNothingToSync, type ManualSyncService } from "../services/manual-sync.service";

interface ExtractionResumed {
  userId: string;
}

function parseExtractionResumed(payload: unknown): Result<ExtractionResumed, string> {
  const parsed = PayloadByEventType[EventTypes.ASSISTANT_EXTRACTION_RESUMED].safeParse(payload);
  return parsed.success ? Result.ok(parsed.data) : Result.fail(parsed.error.message);
}

export const onExtractionResumed = onEvent(
  EventTypes.ASSISTANT_EXTRACTION_RESUMED,
  "classroom-sync-read-paused-announcements",
  (deps: { ManualSyncService: Pick<ManualSyncService, "requestAll"> }) =>
    async (_event, payload: ExtractionResumed) => {
      const requested = await deps.ManualSyncService.requestAll(payload.userId);
      if (requested.isFailure && !isNothingToSync(requested.getError()))
        return Result.fail(requested.getError());

      return Result.ok();
    },
  { payload: parseExtractionResumed },
);

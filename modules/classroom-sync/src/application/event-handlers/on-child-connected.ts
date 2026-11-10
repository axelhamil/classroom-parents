import { onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import { isNothingToSync, type ManualSyncService } from "../services/manual-sync.service";

interface ChildConnected {
  userId: string;
  childId: string;
}

function parseChildConnected(payload: unknown): Result<ChildConnected, string> {
  const parsed = PayloadByEventType[EventTypes.CHILD_CONNECTED].safeParse(payload);
  return parsed.success ? Result.ok(parsed.data) : Result.fail(parsed.error.message);
}

export const onChildConnected = onEvent(
  EventTypes.CHILD_CONNECTED,
  "classroom-sync.first-sync",
  (deps: { ManualSyncService: Pick<ManualSyncService, "requestChild"> }) =>
    async (_event, payload: ChildConnected) => {
      const requested = await deps.ManualSyncService.requestChild(payload.userId, payload.childId);
      if (requested.isFailure && !isNothingToSync(requested.getError()))
        return Result.fail(requested.getError());

      return Result.ok();
    },
  { payload: parseChildConnected },
);

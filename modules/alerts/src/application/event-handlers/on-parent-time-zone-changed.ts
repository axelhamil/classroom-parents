import { onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import type { AlertPlanningService } from "../services/alert-planning.service";

type TimeZoneDeps = { AlertPlanningService: Pick<AlertPlanningService, "followTimeZone"> };

function parseParent(payload: unknown): Result<string, string> {
  const parsed = PayloadByEventType[EventTypes.ASSISTANT_PREFERENCE_CHANGED].safeParse(payload);
  if (!parsed.success) return Result.fail(parsed.error.message);

  return Result.ok(parsed.data.userId);
}

export const onParentTimeZoneChanged = onEvent(
  EventTypes.ASSISTANT_PREFERENCE_CHANGED,
  "alerts-follow-time-zone",
  (deps: TimeZoneDeps) => (_event, userId: string) =>
    deps.AlertPlanningService.followTimeZone(userId, userId),
  { payload: parseParent },
);

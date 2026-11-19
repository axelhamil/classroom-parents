import { onEvent, Result } from "@packages/ddd-kit";
import { EventTypes, PayloadByEventType } from "@packages/events";
import type { AccessLossChild } from "../ports/access-loss-repository.port";
import type { AccessLossAlertService } from "../services/access-loss-alert.service";

type AccessLossDeps = { AccessLossAlertService: Pick<AccessLossAlertService, "warn" | "rearm"> };

function parseChild(
  eventType: typeof EventTypes.CHILD_NEEDS_RECONNECT | typeof EventTypes.CHILD_CONNECTED,
) {
  return (payload: unknown): Result<AccessLossChild, string> => {
    const parsed = PayloadByEventType[eventType].safeParse(payload);
    if (!parsed.success) return Result.fail(parsed.error.message);

    return Result.ok({ userId: parsed.data.userId, childId: parsed.data.childId });
  };
}

export const onChildAccessLost = onEvent(
  EventTypes.CHILD_NEEDS_RECONNECT,
  "alerts-access-loss-warn",
  (deps: AccessLossDeps) => (_event, child: AccessLossChild) =>
    deps.AccessLossAlertService.warn(child, new Date()),
  { payload: parseChild(EventTypes.CHILD_NEEDS_RECONNECT) },
);

export const onChildReconnected = onEvent(
  EventTypes.CHILD_CONNECTED,
  "alerts-access-loss-rearm",
  (deps: AccessLossDeps) => (_event, child: AccessLossChild) =>
    deps.AccessLossAlertService.rearm(child, new Date()),
  { payload: parseChild(EventTypes.CHILD_CONNECTED) },
);

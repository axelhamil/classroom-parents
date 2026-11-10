import type { ChildDto } from "../../shared/api/queries/children";

type ChildStatus = ChildDto["status"];

export const CHILD_STATUS_LABEL_KEYS = {
  connected: "status.connected",
  needs_reconnect: "status.needs_reconnect",
  blocked_by_school: "status.blocked_by_school",
  disconnecting: "status.disconnecting",
} as const satisfies Record<ChildStatus, string>;

export const CHILD_STATUS_BADGES = {
  connected: "secondary",
  needs_reconnect: "outline",
  blocked_by_school: "destructive",
  disconnecting: "outline",
} as const satisfies Record<ChildStatus, "secondary" | "outline" | "destructive">;

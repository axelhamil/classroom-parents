import { Option } from "@packages/ddd-kit";
import { HTTPException } from "hono/http-exception";
import type { RouteGuard, RouteGuards } from "../route-guards";

export interface FakeRequester {
  userId?: string;
  clientIp?: string;
  email?: string;
  sessionId?: string;
}

const open: RouteGuard = async (_c, next) => {
  await next();
};

export function openRouteGuards(requester: FakeRequester = {}): RouteGuards {
  const userId = Option.fromNullable(requester.userId);

  return {
    requireAuth: open,
    currentUserId: () => {
      if (userId.isNone()) throw new HTTPException(401, { message: "Unauthorized" });

      return userId.unwrap();
    },
    signedInUserId: () => userId,
    clientIp: () => requester.clientIp ?? "198.51.100.7",
    currentSession: () => {
      if (userId.isNone()) throw new HTTPException(401, { message: "Unauthorized" });

      return {
        id: requester.sessionId ?? "session-1",
        userId: userId.unwrap(),
        email: requester.email ?? `${userId.unwrap()}@example.com`,
      };
    },
  };
}

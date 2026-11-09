import { Option } from "@packages/ddd-kit";
import type { CurrentSession, RouteGuards } from "@packages/http/route-guards";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { SessionData, SessionUser } from "../auth";
import { requireAuth } from "../shared/middleware/auth.middleware";
import { resolveClientIp } from "../shared/middleware/rate-limit.ip";

function sessionUser(c: Context): Option<SessionUser> {
  const user: SessionUser | null | undefined = c.get("user");

  return Option.fromNullable(user);
}

export const routeGuards: RouteGuards = {
  requireAuth,
  currentUserId: (c) => {
    const user = sessionUser(c);
    if (user.isNone()) throw new HTTPException(401, { message: "Unauthorized" });

    return user.unwrap().id;
  },
  signedInUserId: (c) => sessionUser(c).map((user) => user.id),
  clientIp: resolveClientIp,
  currentSession: (c): CurrentSession => {
    const user = sessionUser(c);
    const session: SessionData | null | undefined = c.get("session");
    if (user.isNone() || !session) throw new HTTPException(401, { message: "Unauthorized" });

    return { id: session.id, userId: user.unwrap().id, email: user.unwrap().email };
  },
};

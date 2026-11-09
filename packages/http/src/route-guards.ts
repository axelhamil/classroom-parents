import type { ILogger, Option } from "@packages/ddd-kit";
import type { Context, MiddlewareHandler } from "hono";

export interface RouteEnv {
  Variables: { logger: ILogger; requestId: string };
}

export type RouteGuard = MiddlewareHandler;

export interface CurrentSession {
  id: string;
  userId: string;
  email: string;
}

export interface RouteGuards {
  requireAuth: RouteGuard;
  currentUserId(c: Context): string;
  signedInUserId(c: Context): Option<string>;
  clientIp(c: Context): string;
  currentSession(c: Context): CurrentSession;
}

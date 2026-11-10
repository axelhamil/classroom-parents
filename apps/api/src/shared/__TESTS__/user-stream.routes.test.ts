import { describe, expect, it } from "bun:test";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { Hono } from "hono";
import { logger } from "../logger";
import { createErrorHandler } from "../middleware/error.middleware";
import { NoOpInstrumentation } from "../services/noop-instrumentation";
import {
  MAX_STREAMS_PER_USER,
  NotificationStreamHub,
  userStreamNotification,
} from "../services/notification-stream-hub";
import { createUserStreamRoutes } from "../stream/user-stream.routes";

const decoder = new TextDecoder();

function streamApp(pingMs = 60_000) {
  const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation());
  const app = new Hono().route(
    "/",
    createUserStreamRoutes(
      {
        routeGuards: openRouteGuards({ userId: "parent" }),
        NotificationStreamHub: hub,
      },
      pingMs,
    ),
  );
  app.onError(createErrorHandler(new NoOpInstrumentation()));

  return { hub, app };
}

async function readFrame(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const chunk = await reader.read();
  reader.releaseLock();

  return decoder.decode(chunk.value);
}

describe("GET /stream", () => {
  it("forwards a message published for the signed-in parent as a data frame", async () => {
    const { hub, app } = streamApp();
    const controller = new AbortController();
    const response = await app.request("/", { signal: controller.signal });
    if (!response.body) throw new Error("stream without body");

    hub.dispatch(userStreamNotification("parent", { type: "sync.finished", childId: "c1" }));
    const frame = await readFrame(response.body);
    controller.abort();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(frame).toContain('data: {"type":"sync.finished","childId":"c1"}');
  });

  it("keeps an idle connection alive with a ping event", async () => {
    const { app } = streamApp(5);
    const controller = new AbortController();
    const response = await app.request("/", { signal: controller.signal });
    if (!response.body) throw new Error("stream without body");

    const frame = await readFrame(response.body);
    controller.abort();

    expect(frame).toContain("event: ping");
  });

  it("refuses a stream beyond the per-parent cap", async () => {
    const { hub, app } = streamApp();
    for (let i = 0; i < MAX_STREAMS_PER_USER; i++) hub.subscribe("parent", () => {});

    const response = await app.request("/");

    expect(response.status).toBe(429);
  });
});

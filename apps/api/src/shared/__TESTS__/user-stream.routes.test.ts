import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { FakePgListenClient } from "@packages/outbox/testing/fake-pg-listen-client";
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

function streamApp(
  pingMs = 60_000,
  streamMaxLifetimeMs = Option.none<number>(),
  holdConnect = false,
) {
  const clients: FakePgListenClient[] = [];
  const hub = new NotificationStreamHub(logger, "postgres://unused", new NoOpInstrumentation(), {
    createClient: () => {
      const client = new FakePgListenClient();
      if (holdConnect) client.suspendConnect();
      clients.push(client);
      return client;
    },
  });
  const app = new Hono().route(
    "/",
    createUserStreamRoutes(
      {
        routeGuards: openRouteGuards({ userId: "parent" }),
        NotificationStreamHub: hub,
        streamMaxLifetimeMs,
      },
      pingMs,
    ),
  );
  app.onError(createErrorHandler(new NoOpInstrumentation()));

  return { hub, app, clients };
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

  it("starts listening on the first stream only, so a function that never streams holds no listener", async () => {
    const { app, clients } = streamApp();
    expect(clients).toHaveLength(0);

    const first = new AbortController();
    const second = new AbortController();
    await app.request("/", { signal: first.signal });
    await app.request("/", { signal: second.signal });
    first.abort();
    second.abort();

    expect(clients).toHaveLength(1);
    expect(clients[0]?.listening).toBe(true);
  });

  it("ends the stream cleanly once its maximum lifetime is reached and releases the subscriber", async () => {
    const { hub, app } = streamApp(60_000, Option.some(20));
    const response = await app.request("/");
    if (!response.body) throw new Error("stream without body");

    const body = await new Response(response.body).text();

    expect(body).toBe("");
    expect(hub.subscriberCount("parent")).toBe(0);
  });

  it("given the listener is still connecting, then the stream answers only once it listens, so the reconnect refetch misses nothing", async () => {
    const { app, clients } = streamApp(60_000, Option.none(), true);
    const controller = new AbortController();
    let answered = false;
    const response = Promise.resolve(app.request("/", { signal: controller.signal })).then(
      (res) => {
        answered = true;
        return res;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    const answeredBeforeListening = answered;

    clients[0]?.releaseConnect();
    const opened = await response;
    controller.abort();

    expect(answeredBeforeListening).toBe(false);
    expect(opened.status).toBe(200);
    expect(clients[0]?.listening).toBe(true);
  });
});

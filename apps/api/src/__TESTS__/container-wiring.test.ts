import { describe, expect, it } from "bun:test";
import { buildEventDispatcher } from "@packages/outbox/event-handlers";
import { NoOpInstrumentation } from "../shared/services/noop-instrumentation";
import { PgUserStreamPublisher, userStreamRelay } from "../shared/services/user-stream-relay";

process.env.FAKE_PROVIDERS = "0";
const { di } = await import("../container");

describe("container wiring", () => {
  it("resolves every binding of the composed modules at boot", async () => {
    await di.preload();

    expect(di.FakeProviders.isNone()).toBe(true);
  });

  it("subscribes the stream relay and every handler the composed modules declare", () => {
    const relay = userStreamRelay(new PgUserStreamPublisher(new NoOpInstrumentation()));

    const dispatcher = buildEventDispatcher([relay], di);

    expect(dispatcher.handlersOf("child.account.connected")).toEqual([
      "user-stream-relay",
      "classroom-sync-first-sync",
    ]);
  });
});

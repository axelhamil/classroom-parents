import { beforeEach, describe, expect, it } from "bun:test";
import type { IInstrumentation } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { afterResponse } from "../services/after-response";
import { BackgroundWork } from "../services/background-work";

let instrumentation: PortMock<IInstrumentation>;
let background: BackgroundWork;
let drainedAfter: string[];
let syncState: string;

function delivery() {
  return {
    BackgroundWork: background,
    DeliveryDrain: {
      drain: async () => {
        drainedAfter.push(syncState);
      },
    },
  };
}

beforeEach(() => {
  instrumentation = mockPort<IInstrumentation>();
  background = new BackgroundWork(instrumentation);
  drainedAfter = [];
  syncState = "idle";
});

function request(method: string, path: string): Request {
  return new Request(`http://api.test${path}`, { method });
}

describe("after the response of a request-driven function", () => {
  it("given a mutation, then the outbox and the email queue are drained without waiting for the clock", async () => {
    await afterResponse(delivery(), request("POST", "/me/delete"));

    expect(drainedAfter).toHaveLength(1);
  });

  it("given a work deferred by the request, then it finishes before the drain so its events ship in the same invocation", async () => {
    background.defer(
      new Promise<void>((resolve) =>
        setTimeout(() => {
          syncState = "synced";
          resolve();
        }, 5),
      ),
    );

    await afterResponse(delivery(), request("POST", "/sync/child-1"));

    expect(drainedAfter).toEqual(["synced"]);
  });

  it("given a read, then nothing is drained", async () => {
    await afterResponse(delivery(), request("GET", "/events"));

    expect(drainedAfter).toEqual([]);
  });

  it("given an auth callback reached by GET, then it is drained since it may have written", async () => {
    await afterResponse(delivery(), request("GET", "/api/auth/verify-email"));

    expect(drainedAfter).toHaveLength(1);
  });

  it("given the clock itself, then no second drain runs since the tick drains after its own jobs", async () => {
    await afterResponse(delivery(), request("POST", "/internal/tick"));

    expect(drainedAfter).toEqual([]);
  });
});

describe("BackgroundWork", () => {
  it("given a deferred work that fails, then the failure reaches telemetry and settling still resolves", async () => {
    const error = new Error("classroom unreachable");
    background.defer(Promise.reject(error));

    await background.settled();

    expect(instrumentation.capture).toHaveBeenCalledWith(error);
  });

  it("given a work deferred while settling, then settling waits for it too", async () => {
    let lateDone = false;
    background.defer(
      Promise.resolve().then(() => {
        background.defer(
          new Promise<void>((resolve) =>
            setTimeout(() => {
              lateDone = true;
              resolve();
            }, 5),
          ),
        );
      }),
    );

    await background.settled();

    expect(lateDone).toBe(true);
  });
});

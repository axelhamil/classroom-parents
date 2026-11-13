import type { QueryKey } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  batchInvalidations,
  handleStreamChunk,
  invalidationsFor,
  isServerFailure,
  runUserStream,
  type StreamInvalidations,
  UserStreamError,
} from "./use-user-stream";

function closedStream() {
  const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });

  return { ok: true, status: 200, headers: new Headers(), body };
}

function refused(status: number, headers: Record<string, string> = {}) {
  return { ok: false, status, headers: new Headers(headers), body: null };
}

function streamClosingAfter(ms: number) {
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      setTimeout(() => controller.close(), ms);
    },
  });

  return { ok: true, status: 200, headers: new Headers(), body };
}

async function connectionGaps(
  responses: (index: number) => ReturnType<typeof closedStream> | ReturnType<typeof refused>,
  count: number,
) {
  const controller = new AbortController();
  const times: number[] = [];
  const connect = async () => {
    times.push(Date.now());
    if (times.length === count) controller.abort();

    return responses(times.length - 1);
  };

  const run = runUserStream(
    () => ({ connect, onData: () => {} }),
    controller.signal,
    () => {},
  );
  await vi.runAllTimersAsync();
  await run;

  return times.slice(1).map((time, index) => time - (times[index] ?? 0));
}

describe("runUserStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls back on every connection, the first included", async () => {
    const controller = new AbortController();
    const onConnect = vi.fn();
    let connections = 0;
    const connect = async () => {
      connections += 1;
      if (connections === 3) controller.abort();

      return closedStream();
    };

    const run = runUserStream(
      () => ({ connect, onData: () => {}, onConnect }),
      controller.signal,
      () => {},
    );
    await vi.runAllTimersAsync();
    await run;

    expect(connections).toBe(3);
    expect(onConnect).toHaveBeenCalledTimes(3);
  });

  it("given a server that accepts then closes at once, then the retry delay keeps growing up to its cap", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const gaps = await connectionGaps(() => closedStream(), 8);

    expect(gaps).toEqual([500, 1_000, 2_000, 4_000, 8_000, 15_000, 15_000]);
  });

  it("given a connection that stayed up long enough, then the next retry starts from the shortest delay", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const gaps = await connectionGaps(
      (index) => (index === 3 ? streamClosingAfter(20_000) : closedStream()),
      6,
    );

    expect(gaps).toEqual([500, 1_000, 2_000, 20_000 + 500, 1_000]);
  });

  it("given a refusal that names its delay, then the next attempt waits that long instead of the backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const gaps = await connectionGaps(
      (index) => (index === 0 ? refused(429, { "Retry-After": "40" }) : closedStream()),
      3,
    );

    expect(gaps).toEqual([40_000, 1_000]);
  });

  it("given a refusal and a backoff, then the longer of the two delays applies", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const gaps = await connectionGaps(
      (index) => (index < 3 ? refused(503, { "Retry-After": "1" }) : closedStream()),
      4,
    );

    expect(gaps).toEqual([1_000, 1_000, 2_000]);
  });

  it.each([401, 403, 404])(
    "given a %i answer, then the stream stops retrying and reports it",
    async (status) => {
      const controller = new AbortController();
      const onDisconnect = vi.fn();
      const connect = vi.fn(async () => refused(status));

      const run = runUserStream(
        () => ({ connect, onData: () => {}, onDisconnect }),
        controller.signal,
        () => {},
      );
      await vi.runAllTimersAsync();
      await run;

      expect(connect).toHaveBeenCalledTimes(1);
      expect(onDisconnect).toHaveBeenCalledWith(0, new UserStreamError(status));
    },
  );

  it("calls back once the stream connects after a first refused attempt", async () => {
    const controller = new AbortController();
    const onConnect = vi.fn();
    let connections = 0;
    const connect = async () => {
      connections += 1;
      if (connections === 1) return refused(429);
      controller.abort();

      return closedStream();
    };

    const run = runUserStream(
      () => ({ connect, onData: () => {}, onConnect }),
      controller.signal,
      () => {},
    );
    await vi.runAllTimersAsync();
    await run;

    expect(connections).toBe(2);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });
});

type ProbeType = "probe.changed" | "probe.finished";

const PROBE_INVALIDATIONS: StreamInvalidations<ProbeType> = {
  "probe.changed": [["probe"]],
  "probe.finished": [["probe"], ["other"]],
};

function isProbeType(value: unknown): value is ProbeType {
  return value === "probe.changed" || value === "probe.finished";
}

function parse(value: unknown): { type: ProbeType } | undefined {
  if (typeof value !== "object" || value === null || !("type" in value)) return undefined;

  return isProbeType(value.type) ? { type: value.type } : undefined;
}

describe("handleStreamChunk", () => {
  it("given complete frames, when a chunk arrives, then each data payload is delivered and the partial frame is kept", () => {
    const received: string[] = [];

    const residue = handleStreamChunk(
      'event: ping\ndata: {}\n\ndata: {"type":"probe.changed"}\n\ndata: {"type":"pro',
      (data) => received.push(data),
    );

    expect(received).toEqual(['{"type":"probe.changed"}']);
    expect(residue).toBe('data: {"type":"pro');
  });
});

describe("invalidationsFor", () => {
  it("given a known message, then the keys the app mapped to its type are invalidated", () => {
    expect(invalidationsFor('{"type":"probe.changed"}', parse, PROBE_INVALIDATIONS)).toEqual([
      ["probe"],
    ]);
    expect(
      invalidationsFor('{"type":"probe.finished","id":"c1"}', parse, PROBE_INVALIDATIONS),
    ).toEqual([["probe"], ["other"]]);
  });

  it("given a payload that is not JSON or not a known message, then nothing is invalidated", () => {
    expect(invalidationsFor("not json", parse, PROBE_INVALIDATIONS)).toEqual([]);
    expect(invalidationsFor('{"type":"unknown"}', parse, PROBE_INVALIDATIONS)).toEqual([]);
  });
});

describe("isServerFailure", () => {
  it("given a 5xx answer, then the failure is reported to telemetry", () => {
    expect(isServerFailure(new UserStreamError(503))).toBe(true);
  });

  it("given a refusal or a dropped network, then it stays out of telemetry", () => {
    expect(isServerFailure(new UserStreamError(429))).toBe(false);
    expect(isServerFailure(new TypeError("Failed to fetch"))).toBe(false);
  });
});

describe("batchInvalidations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("given a burst of messages from one sync, then each key is invalidated once after the window", () => {
    const invalidated: QueryKey[][] = [];
    const batch = batchInvalidations((keys) => invalidated.push([...keys]), 250);

    for (let i = 0; i < 40; i += 1) batch.add([["probe"]]);
    batch.add([["probe"], ["other"]]);

    expect(invalidated).toEqual([]);
    vi.advanceTimersByTime(250);
    expect(invalidated).toEqual([[["probe"], ["other"]]]);
  });

  it("given messages after the window closed, then they open a new batch", () => {
    const invalidated: QueryKey[][] = [];
    const batch = batchInvalidations((keys) => invalidated.push([...keys]), 250);

    batch.add([["probe"]]);
    vi.advanceTimersByTime(250);
    batch.add([["other"]]);
    vi.advanceTimersByTime(250);

    expect(invalidated).toEqual([[["probe"]], [["other"]]]);
  });

  it("given the stream stops before the window ends, then the pending keys are invalidated at once", () => {
    const invalidated: QueryKey[][] = [];
    const batch = batchInvalidations((keys) => invalidated.push([...keys]), 250);

    batch.add([["probe"], ["other"]]);
    batch.close();
    expect(invalidated).toEqual([[["probe"], ["other"]]]);

    vi.advanceTimersByTime(250);
    expect(invalidated).toEqual([[["probe"], ["other"]]]);
  });

  it("given the stream stops with nothing pending, then nothing is invalidated", () => {
    const invalidate = vi.fn();
    const batch = batchInvalidations(invalidate, 250);

    batch.close();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("given no key to invalidate, then no batch is opened", () => {
    const invalidate = vi.fn();
    const batch = batchInvalidations(invalidate, 250);

    batch.add([]);
    vi.advanceTimersByTime(250);

    expect(invalidate).not.toHaveBeenCalled();
  });
});

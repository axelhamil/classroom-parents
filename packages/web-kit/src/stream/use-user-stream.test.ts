import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleStreamChunk,
  invalidationsFor,
  runUserStream,
  type UserStreamType,
} from "./use-user-stream";

function closedStream() {
  const body = new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });

  return { ok: true, status: 200, body };
}

describe("runUserStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("calls back once the stream connects after a first refused attempt", async () => {
    const controller = new AbortController();
    const onConnect = vi.fn();
    let connections = 0;
    const connect = async () => {
      connections += 1;
      if (connections === 1) return { ok: false, status: 429, body: null };
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

const STREAM_TYPES: readonly string[] = ["events.changed", "children.changed", "sync.finished"];

function isStreamType(value: unknown): value is UserStreamType {
  return typeof value === "string" && STREAM_TYPES.includes(value);
}

function parse(value: unknown): { type: UserStreamType } | undefined {
  if (typeof value !== "object" || value === null || !("type" in value)) return undefined;

  return isStreamType(value.type) ? { type: value.type } : undefined;
}

describe("handleStreamChunk", () => {
  it("given complete frames, when a chunk arrives, then each data payload is delivered and the partial frame is kept", () => {
    const received: string[] = [];

    const residue = handleStreamChunk(
      'event: ping\ndata: {}\n\ndata: {"type":"events.changed"}\n\ndata: {"type":"chil',
      (data) => received.push(data),
    );

    expect(received).toEqual(['{"type":"events.changed"}']);
    expect(residue).toBe('data: {"type":"chil');
  });
});

describe("invalidationsFor", () => {
  it("given events.changed, then only the events queries are invalidated", () => {
    expect(invalidationsFor('{"type":"events.changed"}', parse)).toEqual([["events"]]);
  });

  it("given children.changed, then only the children queries are invalidated", () => {
    expect(invalidationsFor('{"type":"children.changed"}', parse)).toEqual([["children"]]);
  });

  it("given sync.finished, then events and children are both invalidated", () => {
    expect(invalidationsFor('{"type":"sync.finished","childId":"c1"}', parse)).toEqual([
      ["events"],
      ["children"],
    ]);
  });

  it("given a payload that is not JSON or not a known message, then nothing is invalidated", () => {
    expect(invalidationsFor("not json", parse)).toEqual([]);
    expect(invalidationsFor('{"type":"unknown"}', parse)).toEqual([]);
  });
});

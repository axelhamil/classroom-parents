import { hashKey, type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { retryAfterSeconds } from "../api/errors/api-error";

const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 30_000;
// A connection that closes sooner than this did not prove the server healthy: the next
// retry keeps growing instead of restarting from the shortest delay.
const STABLE_CONNECTION_MS = 10_000;
// The session gate owns 401 and 403; 404 means the endpoint is not deployed. Retrying
// any of them only hammers the API from every open tab.
const TERMINAL_STATUSES: readonly number[] = [401, 403, 404];
// The server sends `event: ping` every 25s. A stall timeout of a bit over 2x that interval tolerates
// one missed ping plus network jitter before treating a silent-but-open connection as dead.
const PING_INTERVAL_MS = 25_000;
const STALL_TIMEOUT_MS = PING_INTERVAL_MS * 2 + 5_000;
// A sync announces each event it stores: the keys of one burst are invalidated once, at the
// end of this window, instead of refetching every open list once per message.
const INVALIDATION_WINDOW_MS = 250;

export type StreamInvalidations<Type extends string> = Readonly<Record<Type, readonly QueryKey[]>>;

export type StreamMessageParser<Type extends string> = (
  value: unknown,
) => { type: Type } | undefined;

function frameData(frame: string): string | undefined {
  const lines = frame.split(LINE_SEPARATOR);
  if (lines.some((line) => line.trimEnd() === "event: ping")) return undefined;

  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());

  return data.length > 0 ? data.join("\n") : undefined;
}

export function handleStreamChunk(chunk: string, onData: (data: string) => void): string {
  const frames = chunk.split(FRAME_SEPARATOR);
  const residue = frames.pop() ?? "";

  for (const frame of frames) {
    const data = frameData(frame);
    if (data !== undefined) onData(data);
  }

  return residue;
}

export function invalidationsFor<Type extends string>(
  data: string,
  parse: StreamMessageParser<Type>,
  invalidations: StreamInvalidations<Type>,
): readonly QueryKey[] {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return [];
  }

  const message = parse(value);

  return message ? invalidations[message.type] : [];
}

export interface InvalidationBatch {
  add: (keys: readonly QueryKey[]) => void;
  close: () => void;
}

export function batchInvalidations(
  invalidate: (keys: readonly QueryKey[]) => void,
  windowMs: number,
): InvalidationBatch {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    const keys = [...pending.values()];
    pending.clear();
    invalidate(keys);
  };

  return {
    add: (keys) => {
      for (const key of keys) pending.set(hashKey(key), key);
      if (pending.size > 0 && timer === undefined) timer = setTimeout(flush, windowMs);
    },
    close: () => {
      clearTimeout(timer);
      timer = undefined;
      if (pending.size > 0) flush();
    },
  };
}

const backoffDelay = (attempt: number) => {
  const exponential = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  return exponential / 2 + Math.random() * (exponential / 2);
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

export async function consume(body: ReadableStream<Uint8Array>, onData: (data: string) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // A silent-but-open connection (e.g. a proxy that keeps the socket up but stops
  // relaying) never rejects `reader.read()` on its own: only a rearmed stall timeout
  // that cancels the reader can surface it. Rearmed on every frame, `ping` included,
  // so a healthy but quiet stream never trips it.
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      void reader.cancel(new Error("USER_STREAM_STALLED"));
    }, STALL_TIMEOUT_MS);
  };

  try {
    armStallTimer();
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      armStallTimer();
      buffer = handleStreamChunk(buffer + decoder.decode(value, { stream: true }), onData);
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
}

export class UserStreamError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs = 0,
  ) {
    super(`USER_STREAM_${status}`);
    this.name = "UserStreamError";
  }
}

// A refusal that names its own delay (429, 503) is retried no sooner: reconnecting on the
// backoff alone hammers a rate limit that already said when it reopens, from every tab.
function retryAfterMs(headers: UserStreamResponse["headers"]): number {
  const header = headers.get("Retry-After");
  const seconds = header === null ? undefined : retryAfterSeconds(header);

  return seconds !== undefined && seconds > 0 ? seconds * 1_000 : 0;
}

export function isServerFailure(error: unknown): boolean {
  return error instanceof UserStreamError && error.status >= 500;
}

export interface UserStreamResponse {
  ok: boolean;
  status: number;
  headers: Pick<Headers, "get">;
  body: ReadableStream<Uint8Array> | null;
}

export interface UserStreamConnection {
  connect: (signal: AbortSignal) => Promise<UserStreamResponse>;
  onData: (data: string) => void;
  onDisconnect?: (attempt: number, error: unknown) => void;
  onConnect?: () => void;
}

export async function runUserStream(
  options: () => UserStreamConnection,
  signal: AbortSignal,
  setConnected: (connected: boolean) => void,
): Promise<void> {
  let attempt = 0;

  while (!signal.aborted) {
    let connectedAt: number | undefined;
    let refusedForMs = 0;
    try {
      const res = await options().connect(signal);
      if (!res.ok || !res.body) throw new UserStreamError(res.status, retryAfterMs(res.headers));

      connectedAt = Date.now();
      setConnected(true);
      options().onConnect?.();
      await consume(res.body, (data) => options().onData(data));
    } catch (err) {
      if (!signal.aborted) options().onDisconnect?.(attempt, err);
      if (err instanceof UserStreamError && TERMINAL_STATUSES.includes(err.status)) return;
      if (err instanceof UserStreamError) refusedForMs = err.retryAfterMs;
    } finally {
      if (!signal.aborted) setConnected(false);
    }

    if (signal.aborted) return;
    if (connectedAt !== undefined && Date.now() - connectedAt >= STABLE_CONNECTION_MS) attempt = 0;
    await sleep(Math.max(backoffDelay(attempt), refusedForMs), signal);
    attempt += 1;
  }
}

export interface UserStreamOptions<Type extends string> {
  connect: (signal: AbortSignal) => Promise<UserStreamResponse>;
  parse: StreamMessageParser<Type>;
  invalidations: StreamInvalidations<Type>;
  reconnectKeys: readonly QueryKey[];
  onServerFailure: (error: unknown) => void;
}

export function useUserStream<Type extends string>(
  options: UserStreamOptions<Type>,
): {
  connected: boolean;
} {
  const queryClient = useQueryClient();
  const latest = useRef(options);
  latest.current = options;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const batch = batchInvalidations((keys) => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
    }, INVALIDATION_WINDOW_MS);
    let connections = 0;

    void runUserStream(
      () => ({
        connect: latest.current.connect,
        onData: (data) =>
          batch.add(invalidationsFor(data, latest.current.parse, latest.current.invalidations)),
        onDisconnect: (_attempt, error) => {
          if (isServerFailure(error)) latest.current.onServerFailure(error);
        },
        onConnect: () => {
          connections += 1;
          if (connections > 1) batch.add(latest.current.reconnectKeys);
        },
      }),
      controller.signal,
      setConnected,
    );

    return () => {
      controller.abort();
      batch.close();
    };
  }, [queryClient]);

  return { connected };
}

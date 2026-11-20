import { toast } from "sonner";
import { afterEach } from "vitest";

// A timer outliving its test fires into the next test, or after the environment is gone: once
// jsdom has removed `window`, React throws from it, an unhandled error that fails the whole run
// (sonner removes a closed toast from a 200 ms timer of its own). Every timer a test leaves behind
// is cancelled once that test is over, so none can.
const pending = new Set<ReturnType<typeof globalThis.setTimeout>>();

const startTimeout = globalThis.setTimeout;
const stopTimeout = globalThis.clearTimeout;

function trackedTimeout(...args: Parameters<typeof startTimeout>): ReturnType<typeof startTimeout> {
  const [handler, delay, ...rest] = args;
  const id = startTimeout(
    (...handlerArgs: unknown[]) => {
      pending.delete(id);
      if (typeof handler === "function") handler(...handlerArgs);
    },
    delay,
    ...rest,
  );
  pending.add(id);

  return id;
}

function untrackedClear(id?: Parameters<typeof stopTimeout>[0]): void {
  if (id !== undefined && id !== null && typeof id === "object") pending.delete(id);
  stopTimeout(id);
}

globalThis.setTimeout = Object.assign(trackedTimeout, startTimeout);
globalThis.clearTimeout = untrackedClear;

afterEach(() => {
  toast.dismiss();
  for (const id of pending) stopTimeout(id);
  pending.clear();
});

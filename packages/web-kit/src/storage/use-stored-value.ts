import { useMemo, useSyncExternalStore } from "react";
import type { z } from "zod";

const listeners = new Map<string, Set<() => void>>();
const unsavable = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? unsavable.get(key) ?? null;
  } catch {
    return unsavable.get(key) ?? null;
  }
}

function subscribe(key: string, listener: () => void): () => void {
  const forKey = listeners.get(key) ?? new Set();
  forKey.add(listener);
  listeners.set(key, forKey);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    forKey.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function parseStored<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (raw === null) return fallback;

  try {
    return schema.safeParse(JSON.parse(raw)).data ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    unsavable.set(key, raw);
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

export function useStoredValue<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    (listener) => subscribe(key, listener),
    () => readRaw(key),
    () => null,
  );
  const value = useMemo(() => parseStored(raw, schema, fallback), [raw, schema, fallback]);

  return [value, (next: T) => writeStoredValue(key, next)];
}

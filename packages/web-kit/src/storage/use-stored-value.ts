import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";

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

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

function storedKeys(): string[] {
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

function removeRaw(key: string): boolean {
  unsavable.delete(key);
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function userStorageKey(userId: string, name: string): string {
  return `user:${userId}:${name}`;
}

export function clearUserStorage(userId: string): void {
  const prefix = userStorageKey(userId, "");
  const keys = [...new Set([...storedKeys(), ...unsavable.keys()])].filter((key) =>
    key.startsWith(prefix),
  );

  for (const key of keys) {
    removeRaw(key);
    notify(key);
  }
}

function writeStoredValue(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    unsavable.set(key, raw);
  }
  notify(key);
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

const RAW_VALUES = z.array(z.string().nullable());

function splitKeys(joined: string): string[] {
  return joined === "" ? [] : joined.split("\n");
}

export function useStoredValues<T>(
  keys: readonly string[],
  schema: z.ZodType<T>,
  fallback: T,
): T[] {
  const joined = keys.join("\n");
  const subscribeAll = useCallback(
    (listener: () => void) => {
      const unsubscribes = splitKeys(joined).map((key) => subscribe(key, listener));
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },
    [joined],
  );
  const raw = useSyncExternalStore(
    subscribeAll,
    () => JSON.stringify(splitKeys(joined).map(readRaw)),
    () => null,
  );

  return useMemo(() => {
    const values = raw === null ? [] : RAW_VALUES.parse(JSON.parse(raw));
    return splitKeys(joined).map((_, index) =>
      parseStored(values[index] ?? null, schema, fallback),
    );
  }, [raw, joined, schema, fallback]);
}

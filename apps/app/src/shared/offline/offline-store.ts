import { clear, createStore, del, delMany, get, keys, set, type UseStore } from "idb-keyval";

let store: UseStore | undefined;

function offlineStore(): UseStore {
  store ??= createStore("keepupkids-offline", "kv");

  return store;
}

export function offlineStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function readOffline<T>(key: string): Promise<T | undefined> {
  return get<T>(key, offlineStore());
}

export function writeOffline(key: string, value: unknown): Promise<void> {
  return set(key, value, offlineStore());
}

export function removeOffline(key: string): Promise<void> {
  return del(key, offlineStore());
}

export function clearOffline(): Promise<void> {
  return clear(offlineStore());
}

export async function removeOfflineWhere(match: (key: string) => boolean): Promise<void> {
  const stored = await keys<string>(offlineStore());

  await delMany(stored.filter(match), offlineStore());
}

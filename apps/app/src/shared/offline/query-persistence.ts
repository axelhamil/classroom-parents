import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  type AsyncStorage,
  type PersistQueryClientOptions,
  persistQueryClientRestore,
  persistQueryClientSubscribe,
  removeOldestQuery,
} from "@tanstack/query-persist-client-core";
import {
  matchMutation,
  matchQuery,
  type QueryClient,
  type QueryFilters,
} from "@tanstack/react-query";
import { markEventDoneMutationOptions } from "../api/mutations/mark-event-done";
import { childrenQueryOptions } from "../api/queries/children";
import { EVENTS_KEY } from "../api/queries/events";
import { env } from "../env";
import { captureError } from "../observability/sentry";
import {
  clearOffline,
  offlineStorageAvailable,
  readOffline,
  removeOffline,
  removeOfflineWhere,
  writeOffline,
} from "./offline-store";

const CACHE_KEY_PREFIX = "queries:";
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const PERSISTED: readonly QueryFilters[] = [
  { queryKey: EVENTS_KEY },
  { queryKey: childrenQueryOptions.queryKey, exact: true },
];
const DONE_KEY = markEventDoneMutationOptions.mutationKey;

interface Persistence {
  userId: string;
  active: boolean;
  unsubscribe: () => void;
  ready: Promise<void>;
}

let current: Persistence | undefined;

function storageOf(persistence: Persistence): AsyncStorage<string> {
  return {
    getItem: async (key) => (await readOffline<string>(key)) ?? null,
    setItem: (key, value) => (persistence.active ? writeOffline(key, value) : Promise.resolve()),
    removeItem: (key) => removeOffline(key),
  };
}

function optionsFor(queryClient: QueryClient, persistence: Persistence): PersistQueryClientOptions {
  return {
    queryClient,
    maxAge: MAX_AGE_MS,
    buster: env.VITE_GIT_SHA ?? "",
    persister: createAsyncStoragePersister({
      storage: storageOf(persistence),
      key: CACHE_KEY_PREFIX + persistence.userId,
      retry: removeOldestQuery,
    }),
    dehydrateOptions: {
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" && PERSISTED.some((filters) => matchQuery(filters, query)),
      shouldDehydrateMutation: (mutation) =>
        mutation.state.isPaused && matchMutation({ mutationKey: DONE_KEY }, mutation),
    },
  };
}

function replayableOffline(queryClient: QueryClient): void {
  for (const { queryKey } of PERSISTED)
    if (queryKey) queryClient.setQueryDefaults(queryKey, { gcTime: MAX_AGE_MS });

  queryClient.setMutationDefaults(DONE_KEY, {
    mutationFn: markEventDoneMutationOptions.mutationFn,
    scope: markEventDoneMutationOptions.scope,
    onSettled: () => queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}

async function restoreThenFollow(
  queryClient: QueryClient,
  persistence: Persistence,
): Promise<void> {
  const options = optionsFor(queryClient, persistence);
  const ownKey = CACHE_KEY_PREFIX + persistence.userId;

  await removeOfflineWhere((key) => key.startsWith(CACHE_KEY_PREFIX) && key !== ownKey);
  await persistQueryClientRestore(options);
  await Promise.all(
    PERSISTED.map((filters) => queryClient.invalidateQueries({ ...filters, refetchType: "none" })),
  );
  if (!persistence.active) return;

  persistence.unsubscribe = persistQueryClientSubscribe(options);
  void queryClient.resumePausedMutations();
}

function stopPersistence(): void {
  if (!current) return;

  current.active = false;
  current.unsubscribe();
  current = undefined;
}

/**
 * Keeps the signed-in parent's agenda (events, children) and their pending "done" ticks
 * in IndexedDB under a key of their own, restores it on the next launch and replays the
 * ticks once the network is back. One parent per device: starting for a parent stops
 * following the previous one. Never rejects: a storage failure only costs offline reading.
 */
export function keepQueriesOffline(queryClient: QueryClient, userId: string): Promise<void> {
  if (!offlineStorageAvailable()) return Promise.resolve();
  if (current?.userId === userId) return current.ready;

  stopPersistence();
  replayableOffline(queryClient);
  const persistence: Persistence = {
    userId,
    active: true,
    unsubscribe: () => undefined,
    ready: Promise.resolve(),
  };
  persistence.ready = restoreThenFollow(queryClient, persistence).catch((error: unknown) =>
    captureError(error, { area: "offline" }),
  );
  current = persistence;

  return persistence.ready;
}

/** Stops persisting and wipes every stored agenda and session of this device, and the app badge. */
export async function forgetOfflineData(): Promise<void> {
  stopPersistence();
  void navigator.clearAppBadge?.().catch(() => undefined);
  if (!offlineStorageAvailable()) return;

  await clearOffline();
}

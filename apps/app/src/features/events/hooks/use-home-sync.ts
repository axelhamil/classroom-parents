import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { toastError, toastSuccess } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import {
  readStoredValue,
  userStorageKey,
  writeStoredValue,
} from "@packages/web-kit/storage/use-stored-value";
import {
  onlineManager,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useActorRef, useSelector } from "@xstate/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ActorRefFrom, fromPromise, type SnapshotFrom } from "xstate";
import { z } from "zod";
import {
  type HomeEditInput,
  homeEditMachine,
  type SaveInput,
  type SaveOutcome,
} from "../../../shared/dashboard/home-edit.machine";
import { ADVISED, type Draft, isAdvised } from "../../../shared/dashboard/layout-commands";
import {
  readStoredLayout,
  type StoredLayout,
  storedLayoutOf,
  storedLayoutSchema,
} from "../../../shared/dashboard/layout-migration";
import { currentGridColumns } from "../../../shared/dashboard/use-grid-columns";
import { isConnectionFailure } from "../../../shared/offline/connection";
import { saveHomeLayoutMutationOptions } from "../api/home.mutations";
import { HOME_LAYOUT_KEY, type HomeLayoutReply, homeLayoutQueryOptions } from "../api/home.queries";
import { ADVICE_ONLY_BLOCK_IDS, boundsOf } from "../home-block-bounds";
import { layoutOf, savedBlocksOf } from "../home-layout-draft";

const UNKNOWN_REVISION = -1;

const LAYOUT_STALE = "HOME_LAYOUT_STALE";

const STORED_LAYOUT_NAME = "home:layout:v2";

const localCopySchema = storedLayoutSchema
  .extend({ revision: z.number().int().nonnegative() })
  .nullable();

type LocalCopy = z.infer<typeof localCopySchema>;

type ServerLayout = StoredLayout & Pick<HomeLayoutReply, "revision">;

const NETWORK: SaveOutcome = { kind: "network" };

const REJECTED: SaveOutcome = { kind: "rejected" };

export type HomeSyncActor = ActorRefFrom<typeof homeEditMachine>;

type HomeSyncSnapshot = SnapshotFrom<typeof homeEditMachine>;

export type HomeEditState = ReturnType<typeof editStateOf>;

export type HomeSyncState = HomeSyncSnapshot["value"]["sync"];

export interface HomeSync {
  actor: HomeSyncActor;
  order: Draft | null;
  revision: number;
  known: boolean;
  editState: HomeEditState;
  syncState: HomeSyncState;
  send: HomeSyncActor["send"];
}

/**
 * The home layout kept in step with the server through the edit machine:
 * one save at a time carrying the revision it builds on, the latest draft
 * only, held back while offline and sent when the network returns. A layout
 * changed on another device is adopted silently when nothing local waits,
 * and opens the conflict otherwise; the echo of our own save is ignored.
 * `known` turns true once a layout came from the device or the server, or the
 * server cannot answer: drawing the home before would rearrange it under the eye.
 */
export function useHomeSync(userId: string, registry: readonly string[]): HomeSync {
  const queryClient = useQueryClient();
  const storageKey = userStorageKey(userId, STORED_LAYOUT_NAME);
  const registryRef = useRef(registry);
  const query = useQuery(homeLayoutQueryOptions);
  const { save, lastError } = useLayoutSave(registryRef);
  const [machine] = useState(() =>
    homeEditMachine.provide({ actors: { save: fromPromise(save) } }),
  );
  const [input] = useState(() => seedOf(queryClient, storageKey, registry));
  const actor = useActorRef(machine, { input });

  useEffect(() => {
    registryRef.current = registry;
  }, [registry]);

  useServerChanges(actor, query.data, registryRef);
  useBackOnline(actor);
  useSaveToasts(actor, lastError);
  useLocalCopy(actor, storageKey);

  const revision = useSelector(actor, (snapshot) => snapshot.context.baseRevision);
  const unanswered =
    query.failureCount > 0 || query.fetchStatus === "paused" || unreadable(query.data);

  return {
    actor,
    order: useSelector(actor, orderOf),
    revision,
    known: revision !== UNKNOWN_REVISION || unanswered,
    editState: useSelector(actor, editStateOf),
    syncState: useSelector(actor, (snapshot) => snapshot.value.sync),
    send: actor.send,
  };
}

function useLayoutSave(registryRef: RefObject<readonly string[]>) {
  const queryClient = useQueryClient();
  const lastError = useRef<unknown>(null);
  const { mutateAsync } = useMutation({
    ...saveHomeLayoutMutationOptions,
    onSuccess: (saved) => queryClient.setQueryData(HOME_LAYOUT_KEY, saved),
  });

  const save = async ({ input }: { input: SaveInput }): Promise<SaveOutcome> => {
    if (!onlineManager.isOnline()) return NETWORK;

    try {
      const saved = await mutateAsync({
        ...storedLayoutOf(savedBlocksOf(input.blocks)),
        baseRevision: Math.max(input.baseRevision, 0),
      });

      return { kind: "ok", revision: saved.revision };
    } catch (error) {
      lastError.current = error;

      return failureOutcome(error, queryClient, registryRef.current);
    }
  };

  return { save, lastError };
}

async function failureOutcome(
  error: unknown,
  queryClient: QueryClient,
  registry: readonly string[],
): Promise<SaveOutcome> {
  if (isConnectionFailure(error)) return NETWORK;

  const { status, code } = apiErrorFields(error);
  if (status !== 409 || code !== LAYOUT_STALE) return REJECTED;

  try {
    const remote = await queryClient.fetchQuery({ ...homeLayoutQueryOptions, staleTime: 0 });

    return { kind: "conflict", remote: remoteOf(remote, registry) };
  } catch {
    return NETWORK;
  }
}

function useServerChanges(
  actor: HomeSyncActor,
  data: HomeLayoutReply | undefined,
  registryRef: RefObject<readonly string[]>,
): void {
  useEffect(() => {
    if (!data) return;

    const remote = remoteOf(data, registryRef.current);
    actor.send({ type: "REMOTE_CHANGED", layout: remote.blocks, revision: remote.revision });

    if (onlineManager.isOnline()) actor.send({ type: "ONLINE" });
  }, [actor, data, registryRef]);
}

function useBackOnline(actor: HomeSyncActor): void {
  useEffect(
    () =>
      onlineManager.subscribe((online) => {
        if (online) actor.send({ type: "ONLINE" });
      }),
    [actor],
  );
}

function useSaveToasts(actor: HomeSyncActor, lastError: RefObject<unknown>): void {
  const { t } = useTranslation("home");

  useEffect(() => {
    const offline = actor.on("savedOffline", () => toastSuccess(t("sync.savedOffline")));
    const rejected = actor.on("saveRejected", () =>
      toastError(lastError.current, errorFallback("saveHomeLayout")),
    );

    return () => {
      offline.unsubscribe();
      rejected.unsubscribe();
    };
  }, [actor, lastError, t]);
}

function useLocalCopy(actor: HomeSyncActor, storageKey: string): void {
  const committed = useSelector(actor, (snapshot) => snapshot.context.committed);
  const revision = useSelector(actor, (snapshot) => snapshot.context.baseRevision);

  useEffect(() => {
    if (revision === UNKNOWN_REVISION) return;

    writeStoredValue(storageKey, { ...storedLayoutOf(savedBlocksOf(committed)), revision });
  }, [committed, revision, storageKey]);
}

function seedOf(
  queryClient: QueryClient,
  storageKey: string,
  registry: readonly string[],
): HomeEditInput {
  const known = queryClient.getQueryData(homeLayoutQueryOptions.queryKey) ?? localCopy(storageKey);
  const kit: Omit<HomeEditInput, "layout" | "revision"> = {
    columns: currentGridColumns(),
    sizingOf: boundsOf,
    adviceOnly: ADVICE_ONLY_BLOCK_IDS,
  };
  if (!known) return { layout: ADVISED, revision: UNKNOWN_REVISION, ...kit };

  const { blocks, revision } = remoteOf(known, registry);

  return { layout: blocks, revision, ...kit };
}

/** A reply with no revision is never adopted, so waiting for it would hold the home forever. */
function unreadable(reply: ServerLayout | undefined): boolean {
  return reply !== undefined && !Number.isInteger(reply.revision);
}

/** The device's copy, dropped when it is not in the current form: the server's answer replaces it. */
function localCopy(storageKey: string): LocalCopy {
  return readStoredValue(storageKey, localCopySchema, null);
}

function remoteOf(layout: ServerLayout, registry: readonly string[]) {
  return { blocks: layoutOf(readStoredLayout(layout), registry), revision: layout.revision };
}

/**
 * The order the page draws. While a pointer carries a tile, the grid engine moves the tiles itself
 * and the page keeps the order the gesture started from, so a step of the tile renders nothing else.
 */
function orderOf(snapshot: HomeSyncSnapshot): Draft | null {
  const { draft, gestureStart } = snapshot.context;
  const carried = snapshot.matches({ mode: { editing: "dragging" } });
  const shown = carried && gestureStart ? gestureStart : draft;

  return isAdvised(shown) ? null : shown;
}

function editStateOf(snapshot: HomeSyncSnapshot) {
  const { mode } = snapshot.value;

  return typeof mode === "string" ? mode : mode.editing;
}

import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import {
  type BlockShape,
  type BlockWidth,
  type HomeBlock,
  homeBlockSchema,
  normalizeLayout,
} from "../../../shared/dashboard/dashboard-layout";
import type { BlockSize } from "../../../shared/dashboard/dashboard-pack";
import { readStoredLayout } from "../../../shared/dashboard/layout-migration";
import { type HomeLayoutBody, saveHomeLayoutMutationOptions } from "../api/home.mutations";
import { HOME_LAYOUT_KEY, type HomeLayoutReply, homeLayoutQueryOptions } from "../api/home.queries";
import { useDebounced } from "./use-debounced";

const SAVE_PAUSE_MS = 500;

const STORED_LAYOUT_SCHEMA = z.array(homeBlockSchema).nullable();

const WIDTH_OF_SIZE = { s: 3, m: 4, l: 8, xl: 12 } as const satisfies Record<BlockSize, BlockWidth>;

type LayoutBlocks = HomeLayoutBody["blocks"];

interface Draft {
  layout: HomeBlock[] | null;
  blocks: LayoutBlocks;
}

function shownBlocksOf(blocks: LayoutBlocks): HomeBlock[] | null {
  return (
    blocks?.map(({ id, size }) => ({ id, w: WIDTH_OF_SIZE[size], h: 1, hidden: false })) ?? null
  );
}

export interface HomeLayout {
  layout: HomeBlock[];
  change: (next: readonly HomeBlock[]) => void;
  reset: () => void;
  flush: () => void;
}

function useSaveLayout(onSettled: (body: HomeLayoutBody) => void) {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    ...saveHomeLayoutMutationOptions,
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: HOME_LAYOUT_KEY });
      const previous = queryClient.getQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY);
      queryClient.setQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY, {
        blocks: body.blocks,
        revision: body.baseRevision,
      });

      return { previous };
    },
    onSuccess: (saved) => queryClient.setQueryData(HOME_LAYOUT_KEY, saved),
    onError: (error, _body, context) => {
      queryClient.setQueryData(HOME_LAYOUT_KEY, context?.previous);
      toastError(error, errorFallback("saveHomeLayout"));
    },
    onSettled: (_saved, _error, body) => onSettled(body),
  });

  return useCallback(
    (blocks: LayoutBlocks) =>
      mutate({
        blocks,
        baseRevision: queryClient.getQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY)?.revision ?? 0,
      }),
    [mutate, queryClient],
  );
}

/**
 * The parent's home, drawn at once from the copy kept on this device, then
 * from the server. A gesture shows at once as a draft and one save leaves
 * after a short pause, so a burst of clicks costs one request; the save
 * writes the cache optimistically and an error puts the previous layout back.
 */
export function useHomeLayout(
  registry: readonly BlockShape[],
  defaults: readonly HomeBlock[],
): HomeLayout {
  const { user } = ProtectedRoute.useRouteContext();
  const [stored, setStored] = useStoredValue(
    userStorageKey(user.id, "home:layout"),
    STORED_LAYOUT_SCHEMA,
    null,
  );
  const query = useQuery(homeLayoutQueryOptions);
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const save = useSaveLayout((body) =>
    setDraft((current) => (current?.blocks === body.blocks ? undefined : current)),
  );
  const { schedule, flush } = useDebounced(save, SAVE_PAUSE_MS);
  const fetched = query.data ? shownBlocksOf(query.data.blocks) : undefined;
  const shown = draft ? draft.layout : fetched;

  useEffect(() => {
    if (query.data) setStored(shownBlocksOf(query.data.blocks));
  }, [query.data, setStored]);

  const change = (next: readonly HomeBlock[] | null) => {
    const blocks = next ? readStoredLayout(next) : null;
    setDraft({ layout: next ? [...next] : null, blocks });
    schedule(blocks);
  };

  return {
    layout: normalizeLayout(shown === undefined ? stored : shown, registry, defaults),
    change,
    reset: () => {
      change(null);
      flush();
    },
    flush,
  };
}

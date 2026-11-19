import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { userStorageKey, useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import {
  type BlockShape,
  type HomeBlock,
  homeBlockSchema,
  normalizeLayout,
} from "../../../shared/dashboard/dashboard-layout";
import { type HomeLayoutBody, saveHomeLayoutMutationOptions } from "../api/home.mutations";
import { HOME_LAYOUT_KEY, type HomeLayoutReply, homeLayoutQueryOptions } from "../api/home.queries";
import { useDebounced } from "./use-debounced";

const SAVE_PAUSE_MS = 500;

const STORED_LAYOUT_SCHEMA = z.array(homeBlockSchema).nullable();

export interface HomeLayout {
  layout: HomeBlock[];
  change: (next: readonly HomeBlock[]) => void;
  reset: () => void;
  flush: () => void;
}

function useSaveLayout(onSettled: (body: HomeLayoutBody) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    ...saveHomeLayoutMutationOptions,
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: HOME_LAYOUT_KEY });
      const previous = queryClient.getQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY);
      queryClient.setQueryData<HomeLayoutReply>(HOME_LAYOUT_KEY, body);

      return { previous };
    },
    onError: (error, _body, context) => {
      queryClient.setQueryData(HOME_LAYOUT_KEY, context?.previous);
      toastError(error, errorFallback("saveHomeLayout"));
    },
    onSettled: (_saved, _error, body) => onSettled(body),
  }).mutate;
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
  const [draft, setDraft] = useState<HomeLayoutBody | undefined>(undefined);
  const save = useSaveLayout((body) =>
    setDraft((current) => (current === body ? undefined : current)),
  );
  const { schedule, flush } = useDebounced(save, SAVE_PAUSE_MS);
  const shown = draft ?? query.data;

  useEffect(() => {
    if (query.data) setStored(query.data.blocks);
  }, [query.data, setStored]);

  const change = (next: readonly HomeBlock[] | null) => {
    const body = { blocks: next ? [...next] : null };
    setDraft(body);
    schedule(body);
  };

  return {
    layout: normalizeLayout(shown ? shown.blocks : stored, registry, defaults),
    change,
    reset: () => {
      change(null);
      flush();
    },
    flush,
  };
}

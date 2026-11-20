import { toastError } from "@packages/web-kit/api/errors/toast";
import { type ErrorFallbackKey, errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import {
  type DataTag,
  type QueryKey,
  type UseMutationOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const SAVED_TOAST = "settings-saved";

export interface AutoSaveOptions<TData, TValue, TSaved> {
  mutation: UseMutationOptions<TSaved, Error, TValue>;
  queryKey: DataTag<QueryKey, TData, Error>;
  /** The cached setting once `value` is chosen: shown at once, before the server answers. */
  apply: (data: TData, value: TValue) => TData;
  /** The cached setting once the server answered `saved`. */
  merge: (data: TData, saved: TSaved) => TData;
  /** The value that brings `data` back, for the undo. */
  restoreValue: (data: TData) => TValue;
  failure: ErrorFallbackKey;
  onSaved?: (saved: TData, previous: TData | undefined) => void;
}

export interface AutoSave<TValue> {
  save: (value: TValue) => void;
}

/**
 * Saves a setting the moment it changes: the cache shows the new value at once, a failure puts
 * the old one back with its error, a success says « Enregistré » with a way to undo.
 */
export function useAutoSave<TData, TValue, TSaved>({
  mutation: options,
  queryKey,
  apply,
  merge,
  restoreValue,
  failure,
  onSaved,
}: AutoSaveOptions<TData, TValue, TSaved>): AutoSave<TValue> {
  const { t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const undoing = useRef(false);

  const announce = (undo: (() => void) | undefined) =>
    toast.success(t("saved.toast"), {
      id: SAVED_TOAST,
      action: undo ? { label: t("saved.undo"), onClick: undo } : undefined,
    });

  const mutation = useMutation({
    ...options,
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      if (previous !== undefined) queryClient.setQueryData(queryKey, apply(previous, value));

      return { previous };
    },
    onError: (error, _value, context) => {
      undoing.current = false;
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
      toastError(error, errorFallback(failure));
    },
    onSuccess: (answer, _value, context) => {
      const undone = undoing.current;
      undoing.current = false;
      const previous = context?.previous;
      const current = queryClient.getQueryData(queryKey);
      if (current === undefined) return;

      const saved = merge(current, answer);
      queryClient.setQueryData(queryKey, saved);
      onSaved?.(saved, previous);
      announce(undone || previous === undefined ? undefined : () => undo(restoreValue(previous)));
    },
  });

  const undo = (value: TValue) => {
    undoing.current = true;
    mutation.mutate(value);
  };

  return { save: (value) => mutation.mutate(value) };
}

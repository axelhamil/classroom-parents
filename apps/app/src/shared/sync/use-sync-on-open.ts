import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { requestSyncMutationOptions } from "../api/mutations/request-sync";
import { childrenQueryOptions } from "../api/queries/children";

let requestedThisOpen = false;

export function useSyncOnOpen(): void {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    ...requestSyncMutationOptions,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: childrenQueryOptions.queryKey }),
  });

  useEffect(() => {
    if (requestedThisOpen) return;

    requestedThisOpen = true;
    mutate();
  }, [mutate]);
}

import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EVENTS_KEY, type EventItem } from "../../../shared/api/queries/events";
import { markEventDoneMutationOptions } from "../api/events.mutations";
import { CALENDAR_KEY, eventQueryOptions } from "../api/events.queries";

export function useToggleDone() {
  const queryClient = useQueryClient();

  return useMutation({
    ...markEventDoneMutationOptions,
    onMutate: async ({ eventId, done }) => {
      const detailKey = eventQueryOptions(eventId).queryKey;
      await queryClient.cancelQueries({ queryKey: CALENDAR_KEY });
      await queryClient.cancelQueries({ queryKey: detailKey });
      const calendars = queryClient.getQueriesData<EventItem[]>({ queryKey: CALENDAR_KEY });
      const detail = queryClient.getQueryData(detailKey);
      queryClient.setQueriesData<EventItem[]>({ queryKey: CALENDAR_KEY }, (items) =>
        items?.map((event) => (event.id === eventId ? { ...event, done } : event)),
      );
      queryClient.setQueryData(detailKey, (event) => event && { ...event, done });

      return { calendars, detailKey, detail };
    },
    onError: (error, _toggle, context) => {
      for (const [key, items] of context?.calendars ?? []) queryClient.setQueryData(key, items);
      if (context) queryClient.setQueryData(context.detailKey, context.detail);
      toastError(error, errorFallback("markEventDone"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}

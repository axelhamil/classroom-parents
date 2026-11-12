import { CHECKLIST_ITEM_MAX } from "@packages/events/agenda-contract";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import {
  readStoredValue,
  removeStoredValue,
  userStorageKey,
} from "@packages/web-kit/storage/use-stored-value";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Route as ProtectedRoute } from "../../../router/_protected";
import { EVENTS_KEY, type EventItem } from "../../../shared/api/queries/events";
import type { EventCategory } from "../../../shared/events/event-labels";
import { type ChecklistChange, changeChecklistMutationOptions } from "../api/events.mutations";
import { eventQueryOptions } from "../api/events.queries";

const CHECKLIST_DEFAULTS = {
  swimming: [
    "prepare.items.swimming.swimsuit",
    "prepare.items.swimming.cap",
    "prepare.items.swimming.towel",
    "prepare.items.swimming.showerGel",
  ],
  school_trip: [
    "prepare.items.school_trip.lunch",
    "prepare.items.school_trip.outfit",
    "prepare.items.school_trip.permission",
  ],
  document_due: ["prepare.items.document_due.sign", "prepare.items.document_due.pack"],
  assessment: ["prepare.items.assessment.revise"],
  homework: ["prepare.items.homework.check"],
  other: [],
} as const satisfies Record<EventCategory, readonly string[]>;

const localChecklistSchema = z
  .object({
    done: z.array(z.string()),
    removed: z.array(z.string()),
    extra: z.array(z.object({ id: z.string(), label: z.string().max(CHECKLIST_ITEM_MAX) })),
  })
  .nullable();

type ChecklistState = EventItem["checklist"];

export interface ChecklistEntry {
  id: string;
  label: string;
  done: boolean;
}

export interface Checklist {
  items: ChecklistEntry[];
  doneCount: number;
  toggle: (id: string, done: boolean) => void;
  add: (label: string) => void;
  remove: (id: string) => void;
}

type ChecklistEvent = Pick<EventItem, "id" | "category" | "checklist">;

function localChecklistKey(userId: string, eventId: string): string {
  return userStorageKey(userId, `checklist:${eventId}`);
}

function entriesOf(
  state: ChecklistState,
  category: EventCategory,
  t: TFunction<"events">,
): ChecklistEntry[] {
  const defaults = CHECKLIST_DEFAULTS[category]
    .filter((key) => !state.removed.includes(key))
    .map((key) => ({ id: key, label: t(key) }));

  return [...defaults, ...state.extra].map((item) => ({
    ...item,
    done: state.done.includes(item.id),
  }));
}

function applied(state: ChecklistState, change: ChecklistChange): ChecklistState {
  switch (change.kind) {
    case "tick":
      return {
        ...state,
        done: change.done
          ? [...state.done.filter((id) => id !== change.itemId), change.itemId]
          : state.done.filter((id) => id !== change.itemId),
      };
    case "add":
      return { ...state, extra: [...state.extra, { id: change.id, label: change.label }] };
    case "remove":
      return {
        done: state.done.filter((id) => id !== change.itemId),
        removed: [...state.removed, change.itemId],
        extra: state.extra.filter((item) => item.id !== change.itemId),
      };
    case "import":
      return state;
  }
}

function useChangeChecklist(eventId: string) {
  const queryClient = useQueryClient();
  const detailKey = eventQueryOptions(eventId).queryKey;

  return useMutation({
    ...changeChecklistMutationOptions,
    onMutate: async ({ change }) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const detail = queryClient.getQueryData(detailKey);
      queryClient.setQueryData(
        detailKey,
        (event) => event && { ...event, checklist: applied(event.checklist, change) },
      );

      return { detail };
    },
    onError: (error, _change, context) => {
      queryClient.setQueryData(detailKey, context?.detail);
      toastError(error, errorFallback("changeChecklist"));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}

export function useChecklist(event: ChecklistEvent): Checklist {
  const { t } = useTranslation("events");
  const { user } = ProtectedRoute.useRouteContext();
  const { mutate } = useChangeChecklist(event.id);
  const imported = useRef(false);
  const items = entriesOf(event.checklist, event.category, t);
  const send = (change: ChecklistChange) => mutate({ eventId: event.id, change });

  useEffect(() => {
    const key = localChecklistKey(user.id, event.id);
    const local = readStoredValue(key, localChecklistSchema, null);
    if (!local || imported.current) return;

    imported.current = true;
    mutate(
      { eventId: event.id, change: { kind: "import", checklist: local } },
      { onSuccess: () => removeStoredValue(key) },
    );
  }, [user.id, event.id, mutate]);

  return {
    items,
    doneCount: items.filter((item) => item.done).length,
    toggle: (itemId, done) => send({ kind: "tick", itemId, done }),
    add: (label) => send({ kind: "add", id: crypto.randomUUID(), label }),
    remove: (itemId) => send({ kind: "remove", itemId }),
  };
}

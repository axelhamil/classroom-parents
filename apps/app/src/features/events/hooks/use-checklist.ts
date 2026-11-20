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
import {
  type AskedStep,
  askedStepsOf,
  suggestedStepIdsOf,
} from "../../../shared/agenda/checklist-template";
import { EVENTS_KEY, type EventItem } from "../../../shared/api/queries/events";
import { type ChecklistChange, changeChecklistMutationOptions } from "../api/events.mutations";
import { patchCachedEvent } from "../api/events.queries";

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
  removable: boolean;
}

/**
 * `toPrepare` is what the announcement asks, then what the parent added; `suggested` is the
 * template of the category, kept apart and never counted. `quotes` are the passages of the
 * announcement that ask, each once.
 */
export interface Checklist {
  toPrepare: ChecklistEntry[];
  suggested: ChecklistEntry[];
  quotes: string[];
  doneCount: number;
  toggle: (id: string, done: boolean) => void;
  add: (label: string) => void;
  remove: (id: string) => void;
}

type ChecklistEvent = Pick<EventItem, "id" | "category" | "checklist" | "preparation">;

const AMOUNT_LOCALE = "fr-FR";

function localChecklistKey(userId: string, eventId: string): string {
  return userStorageKey(userId, `checklist:${eventId}`);
}

function askedLabel({ label, amountCents, currency }: AskedStep, t: TFunction<"events">): string {
  if (amountCents === null || currency === null) return label;

  const amount = new Intl.NumberFormat(AMOUNT_LOCALE, { style: "currency", currency }).format(
    amountCents / 100,
  );

  return t("prepare.amount", { label, amount });
}

function entriesOf(event: ChecklistEvent, t: TFunction<"events">) {
  const { done } = event.checklist;
  const ticked = (item: Omit<ChecklistEntry, "done">): ChecklistEntry => ({
    ...item,
    done: done.includes(item.id),
  });
  const asked = askedStepsOf(event);
  const toPrepare = [
    ...asked.map((step) => ({ id: step.id, label: askedLabel(step, t), removable: false })),
    ...event.checklist.extra.map((item) => ({ ...item, removable: true })),
  ].map(ticked);
  const suggested = suggestedStepIdsOf(event)
    .map((key) => ({ id: key, label: t(key), removable: true }))
    .map(ticked);

  return { toPrepare, suggested, quotes: [...new Set(asked.map((step) => step.quote))] };
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

  return useMutation({
    ...changeChecklistMutationOptions,
    onMutate: async ({ change }) => ({
      rollback: await patchCachedEvent(queryClient, eventId, (event) => ({
        checklist: applied(event.checklist, change),
      })),
    }),
    onError: (error, _change, context) => {
      context?.rollback();
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
  const entries = entriesOf(event, t);
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
    ...entries,
    doneCount: entries.toPrepare.filter((item) => item.done).length,
    toggle: (itemId, done) => send({ kind: "tick", itemId, done }),
    add: (label) => send({ kind: "add", id: crypto.randomUUID(), label }),
    remove: (itemId) => send({ kind: "remove", itemId }),
  };
}

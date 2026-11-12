import { useStoredValue } from "@packages/web-kit/storage/use-stored-value";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import type { EventItem } from "../../../shared/api/queries/events";
import type { EventCategory } from "../../../shared/events/event-labels";

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
} as const satisfies Record<EventCategory, readonly string[]>;

export const CHECKLIST_ITEM_MAX = 80;

const checklistStateSchema = z.object({
  done: z.array(z.string()),
  removed: z.array(z.string()),
  extra: z.array(z.object({ id: z.string(), label: z.string().max(CHECKLIST_ITEM_MAX) })),
});

type ChecklistState = z.infer<typeof checklistStateSchema>;

const EMPTY: ChecklistState = { done: [], removed: [], extra: [] };

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

export function useChecklist(event: Pick<EventItem, "id" | "category">): Checklist {
  const { t } = useTranslation("events");
  const [state, setState] = useStoredValue(`checklist:${event.id}`, checklistStateSchema, EMPTY);
  const defaults = CHECKLIST_DEFAULTS[event.category]
    .filter((key) => !state.removed.includes(key))
    .map((key) => ({ id: key, label: t(key) }));
  const items = [...defaults, ...state.extra].map((item) => ({
    ...item,
    done: state.done.includes(item.id),
  }));

  return {
    items,
    doneCount: items.filter((item) => item.done).length,
    toggle: (id, done) =>
      setState({
        ...state,
        done: done ? [...state.done, id] : state.done.filter((doneId) => doneId !== id),
      }),
    add: (label) =>
      setState({ ...state, extra: [...state.extra, { id: crypto.randomUUID(), label }] }),
    remove: (id) =>
      setState({
        done: state.done.filter((doneId) => doneId !== id),
        removed: [...state.removed, id],
        extra: state.extra.filter((item) => item.id !== id),
      }),
  };
}

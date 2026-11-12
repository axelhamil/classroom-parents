import { Result, ValueObject } from "@packages/ddd-kit";
import { CHECKLIST_ITEM_MAX, CHECKLIST_ITEMS_MAX } from "@packages/events/agenda-contract";
import { z } from "zod";

const checklistTextSchema = z.string().trim().min(1).max(CHECKLIST_ITEM_MAX);

export const eventChecklistSchema = z.object({
  done: z.array(checklistTextSchema).max(CHECKLIST_ITEMS_MAX),
  removed: z.array(checklistTextSchema).max(CHECKLIST_ITEMS_MAX),
  extra: z
    .array(z.object({ id: checklistTextSchema, label: checklistTextSchema }))
    .max(CHECKLIST_ITEMS_MAX),
});

export type EventChecklistValue = z.infer<typeof eventChecklistSchema>;

export type ChecklistChange =
  | { kind: "tick"; itemId: string; done: boolean }
  | { kind: "add"; id: string; label: string }
  | { kind: "remove"; itemId: string }
  | { kind: "import"; checklist: EventChecklistValue };

function union(kept: readonly string[], incoming: readonly string[]): string[] {
  return [...kept, ...incoming.filter((item) => !kept.includes(item))];
}

function applied(current: EventChecklistValue, change: ChecklistChange): EventChecklistValue {
  switch (change.kind) {
    case "tick":
      return {
        ...current,
        done: change.done
          ? union(current.done, [change.itemId])
          : current.done.filter((id) => id !== change.itemId),
      };
    case "add":
      return current.extra.some((item) => item.id === change.id)
        ? current
        : { ...current, extra: [...current.extra, { id: change.id, label: change.label }] };
    case "remove":
      return {
        done: current.done.filter((id) => id !== change.itemId),
        removed: union(current.removed, [change.itemId]),
        extra: current.extra.filter((item) => item.id !== change.itemId),
      };
    case "import":
      return {
        done: union(current.done, change.checklist.done),
        removed: union(current.removed, change.checklist.removed),
        extra: [
          ...current.extra,
          ...change.checklist.extra.filter((item) =>
            current.extra.every((kept) => kept.id !== item.id),
          ),
        ],
      };
  }
}

export class EventChecklist extends ValueObject<EventChecklistValue> {
  static empty(): EventChecklist {
    return new EventChecklist({ done: [], removed: [], extra: [] });
  }

  change(change: ChecklistChange): Result<EventChecklist> {
    return EventChecklist.create(applied(this.value, change));
  }

  protected validate(value: EventChecklistValue): Result<EventChecklistValue> {
    const parsed = eventChecklistSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(
        `a checklist holds at most ${CHECKLIST_ITEMS_MAX} items of 1 to ${CHECKLIST_ITEM_MAX} characters`,
      );

    return Result.ok(parsed.data);
  }
}

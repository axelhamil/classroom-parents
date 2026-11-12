import { Result, ValueObject } from "@packages/ddd-kit";
import { CHECKLIST_ITEM_MAX, CHECKLIST_ITEMS_MAX } from "@packages/events/agenda-contract";
import { z } from "zod";

const checklistTextSchema = z.string().trim().min(1).max(CHECKLIST_ITEM_MAX);

const checklistItemsSchema = z.object({
  done: z.array(checklistTextSchema).max(CHECKLIST_ITEMS_MAX),
  removed: z.array(checklistTextSchema).max(CHECKLIST_ITEMS_MAX),
  extra: z
    .array(z.object({ id: checklistTextSchema, label: checklistTextSchema }))
    .max(CHECKLIST_ITEMS_MAX),
});

export const eventChecklistSchema = checklistItemsSchema.extend({
  written: z.boolean().default(false),
});

export type ChecklistItems = z.infer<typeof checklistItemsSchema>;

export type EventChecklistValue = z.output<typeof eventChecklistSchema>;

export type StoredChecklist = z.input<typeof eventChecklistSchema>;

export type ChecklistChange =
  | { kind: "tick"; itemId: string; done: boolean }
  | { kind: "add"; id: string; label: string }
  | { kind: "remove"; itemId: string }
  | { kind: "import"; checklist: ChecklistItems };

function union(kept: readonly string[], incoming: readonly string[]): string[] {
  return [...kept, ...incoming.filter((item) => !kept.includes(item))];
}

function itemsOf({ done, removed, extra }: EventChecklistValue): ChecklistItems {
  return { done, removed, extra };
}

function sameItems(left: ChecklistItems, right: ChecklistItems): boolean {
  const ordered = ({ done, removed, extra }: ChecklistItems) =>
    JSON.stringify([done, removed, extra.map(({ id, label }) => [id, label])]);

  return ordered(left) === ordered(right);
}

function applied(current: ChecklistItems, change: ChecklistChange): ChecklistItems {
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
    case "remove": {
      const own = current.extra.some((item) => item.id === change.itemId);

      return {
        done: current.done.filter((id) => id !== change.itemId),
        removed: own ? current.removed : union(current.removed, [change.itemId]),
        extra: current.extra.filter((item) => item.id !== change.itemId),
      };
    }
    case "import":
      return change.checklist;
  }
}

export class EventChecklist extends ValueObject<EventChecklistValue> {
  static empty(): EventChecklist {
    return new EventChecklist({ done: [], removed: [], extra: [], written: false });
  }

  items(): ChecklistItems {
    return itemsOf(this.value);
  }

  change(change: ChecklistChange): Result<EventChecklist> {
    if (change.kind === "import" && this.value.written) return Result.ok(this);

    const next = applied(this.items(), change);
    if (sameItems(next, this.items())) return Result.ok(this);

    return EventChecklist.create({ ...next, written: true });
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

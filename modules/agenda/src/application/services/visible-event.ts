import { type AppError, type Option, Result } from "@packages/ddd-kit";
import type { AgendaEvent } from "../../domain/event.aggregate";
import type { IVisibleChildren } from "../ports/visible-children.port";

export async function visibleEvent(
  children: IVisibleChildren,
  userId: string,
  found: Option<AgendaEvent>,
): Promise<Result<Option<AgendaEvent>, AppError>> {
  if (found.isNone()) return Result.ok(found);

  const ids = await children.idsOf(userId);
  if (ids.isFailure) return Result.fail(ids.getError());

  return Result.ok(found.filter((event) => ids.getValue().includes(event.get("childId"))));
}

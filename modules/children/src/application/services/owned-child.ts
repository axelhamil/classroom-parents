import { Result } from "@packages/ddd-kit";
import type { ChildAccount } from "../../domain/child-account.aggregate";
import { childNotFound } from "../errors/children-errors";
import type { ChildrenError, IChildRepository } from "../ports/child-repository.port";

export async function ownedChild(
  children: Pick<IChildRepository, "findOwned">,
  userId: string,
  childId: string,
): Promise<Result<ChildAccount, ChildrenError>> {
  const found = await children.findOwned(userId, childId);
  if (found.isFailure) return Result.fail(found.getError());

  return found.getValue().toResult(childNotFound);
}

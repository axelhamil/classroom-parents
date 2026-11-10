import type { IChildOwnership } from "@modules/agenda/application/ports/child-ownership.port";
import type { ChildConnectionService } from "@modules/children/application/services/child-connection.service";

export function childOwnershipFor(
  children: Pick<ChildConnectionService, "isOwnedBy">,
): IChildOwnership {
  return { isOwnedBy: (userId, childId) => children.isOwnedBy(userId, childId) };
}

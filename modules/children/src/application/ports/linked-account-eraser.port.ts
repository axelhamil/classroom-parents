import type { Result } from "@packages/ddd-kit";
import type { ChildrenError } from "./child-repository.port";

export interface ILinkedAccountEraser {
  delete(userId: string, linkedAccountId: string): Promise<Result<void, ChildrenError>>;
}

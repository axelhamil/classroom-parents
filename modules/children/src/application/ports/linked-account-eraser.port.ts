import type { Option, Result } from "@packages/ddd-kit";
import type { ChildrenError } from "./child-repository.port";

export interface ErasedAccount {
  accountId: string;
}

export interface ILinkedAccountEraser {
  delete(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<ErasedAccount>, ChildrenError>>;
}

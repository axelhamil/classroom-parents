import type { Option, Result } from "@packages/ddd-kit";
import type { ChildrenError } from "./child-repository.port";

export interface LinkedGoogleAccount {
  linkedAccountId: string;
  grantedScopes: string[];
  hasRefreshToken: boolean;
}

export interface IGoogleLinkedAccounts {
  find(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<LinkedGoogleAccount>, ChildrenError>>;

  listForUser(userId: string): Promise<Result<LinkedGoogleAccount[], ChildrenError>>;
}

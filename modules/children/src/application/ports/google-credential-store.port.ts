import type { Option, Result } from "@packages/ddd-kit";
import type { ChildrenError } from "./child-repository.port";
import type { GoogleAccess } from "./google-oauth-client.port";

export interface GoogleCredentials {
  accessToken: Option<string>;
  accessTokenExpiresAt: Option<Date>;
  refreshToken: Option<string>;
}

export interface TokenSealing {
  seal(plain: string): Promise<string>;
  open(sealed: string): Promise<Result<string, string>>;
}

export interface IGoogleCredentialStore {
  read(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<GoogleCredentials>, ChildrenError>>;

  replace(
    userId: string,
    linkedAccountId: string,
    access: GoogleAccess,
  ): Promise<Result<void, ChildrenError>>;
}

import type { Option, Result } from "@packages/ddd-kit";
import type { ChildrenError } from "./child-repository.port";

export interface GoogleAccess {
  accessToken: string;
  expiresAt: Date;
  refreshToken: Option<string>;
}

export interface GoogleProfile {
  email: string;
  givenName: Option<string>;
  picture: Option<string>;
}

export interface IGoogleOAuthClient {
  refresh(refreshToken: string): Promise<Result<GoogleAccess, ChildrenError>>;

  revoke(token: string): Promise<Result<void, ChildrenError>>;

  profile(accessToken: string): Promise<Result<GoogleProfile, ChildrenError>>;
}

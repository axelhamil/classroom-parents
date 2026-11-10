import type { Result } from "@packages/ddd-kit";

export type AccessTokenFailure = "reconnect_needed" | "provider_failure";

export interface IChildAccessTokens {
  accessTokenFor(childId: string): Promise<Result<string, AccessTokenFailure>>;
}

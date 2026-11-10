import type { TokenSealing } from "@modules/children/application/ports/google-credential-store.port";
import { Result } from "@packages/ddd-kit";
import { type SecretConfig, symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";

export type TokenUnsealable = "TOKEN_UNSEALABLE";

export async function openToken(
  sealed: string,
  key: string | SecretConfig,
): Promise<Result<string, TokenUnsealable>> {
  try {
    return Result.ok(await symmetricDecrypt({ key, data: sealed }));
  } catch {
    return Result.fail("TOKEN_UNSEALABLE");
  }
}

export function googleTokenSealing(key: string | SecretConfig): TokenSealing {
  return {
    seal: (plain) => symmetricEncrypt({ key, data: plain }),
    open: (sealed) => openToken(sealed, key),
  };
}

import { messageFromCode, rateLimitedMessage } from "@packages/web-kit/api/errors/messages";
import type { ParseKeys, TFunction } from "i18next";

interface BetterAuthError {
  status?: number;
  message?: string;
  code?: string;
  error?: { code?: string };
}

/**
 * BetterAuth errors stop surfacing the raw server string and go through the
 * same code-keyed `errors` catalog as the API errors, so there is one
 * translation store rather than two.
 */
export function resolveAuthError(
  error: BetterAuthError,
  fallbackKey: ParseKeys<"auth">,
  t: TFunction<"auth">,
  tErrors: TFunction<"errors">,
): string {
  if (error.status === 429) return rateLimitedMessage(tErrors);
  const code = error.code ?? error.error?.code;
  if (code) {
    const mapped = messageFromCode(code, tErrors);
    if (mapped) return mapped;
  }
  return t(fallbackKey);
}

import { describe, expect, it } from "bun:test";
import { symmetricEncrypt } from "better-auth/crypto";
import { authSecretKey } from "../shared/auth/auth-secrets";
import { openToken } from "../shared/auth/token-sealing";

const SECRET = "a-local-test-secret-of-at-least-32-chars";
const OTHER_SECRET = "another-local-test-secret-32-chars-long";
const REFRESH_TOKEN = "1//fixture-refresh-token";

describe("openToken", () => {
  it("returns the plain token sealed under the same key", async () => {
    const key = authSecretKey({ BETTER_AUTH_SECRET: SECRET });
    const sealed = await symmetricEncrypt({ key, data: REFRESH_TOKEN });

    const opened = await openToken(sealed, key);

    expect(opened.isSuccess).toBe(true);
    expect(opened.getValue()).toBe(REFRESH_TOKEN);
  });

  it("refuses a token sealed under another key", async () => {
    const sealed = await symmetricEncrypt({ key: OTHER_SECRET, data: REFRESH_TOKEN });

    const opened = await openToken(sealed, authSecretKey({ BETTER_AUTH_SECRET: SECRET }));

    expect(opened.isFailure).toBe(true);
    expect(opened.getError()).toBe("TOKEN_UNSEALABLE");
  });

  it("refuses a token stored in clear", async () => {
    const opened = await openToken(REFRESH_TOKEN, authSecretKey({ BETTER_AUTH_SECRET: SECRET }));

    expect(opened.getError()).toBe("TOKEN_UNSEALABLE");
  });

  it("still opens a token sealed before a secret rotation", async () => {
    const before = authSecretKey({
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_SECRETS: [{ version: 1, value: SECRET }],
    });
    const sealed = await symmetricEncrypt({ key: before, data: REFRESH_TOKEN });
    const after = authSecretKey({
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_SECRETS: [
        { version: 2, value: OTHER_SECRET },
        { version: 1, value: SECRET },
      ],
    });

    const opened = await openToken(sealed, after);

    expect(opened.getValue()).toBe(REFRESH_TOKEN);
  });
});

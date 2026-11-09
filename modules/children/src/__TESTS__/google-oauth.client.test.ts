import { describe, expect, it, mock } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { GoogleOAuthClient } from "../infrastructure/adapters/google-oauth.client";

const NOW = new Date("2026-11-09T10:00:00.000Z");

function clientAnswering(response: () => Response | Promise<Response>) {
  const fetchImpl = mock(async (_url: string | URL | Request, _init?: RequestInit) => response());
  const client = new GoogleOAuthClient(
    mockInstrumentation(),
    { googleClientId: "client-id", googleClientSecret: "client-secret" },
    Object.assign(fetchImpl, { preconnect: () => {} }),
    () => NOW,
  );
  return { client, fetchImpl };
}

function sentForm(fetchImpl: ReturnType<typeof clientAnswering>["fetchImpl"]): URLSearchParams {
  return new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body ?? ""));
}

describe("GoogleOAuthClient.refresh", () => {
  it("given Google issues a token, then the access token and its expiry are returned", async () => {
    const { client, fetchImpl } = clientAnswering(() =>
      Response.json({ access_token: "ya29.new", expires_in: 3599, token_type: "Bearer" }),
    );

    const result = await client.refresh("1//refresh");

    expect(result.getValue().accessToken).toBe("ya29.new");
    expect(result.getValue().expiresAt).toEqual(new Date(NOW.getTime() + 3599_000));
    expect(result.getValue().refreshToken.isNone()).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(sentForm(fetchImpl))).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      refresh_token: "1//refresh",
      grant_type: "refresh_token",
    });
  });

  it("given invalid_grant, then CHILD_TOKEN_INVALID_GRANT", async () => {
    const { client } = clientAnswering(() =>
      Response.json(
        { error: "invalid_grant", error_description: "Token has been expired or revoked." },
        { status: 400 },
      ),
    );

    const result = await client.refresh("1//revoked");

    expect(result.getError().code).toBe("CHILD_TOKEN_INVALID_GRANT");
  });

  it("given a Google outage, then CHILD_PROVIDER_FAILURE", async () => {
    const { client } = clientAnswering(() => new Response("upstream", { status: 503 }));

    const result = await client.refresh("1//refresh");

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });

  it("given the network fails, then CHILD_PROVIDER_FAILURE without throwing", async () => {
    const { client } = clientAnswering(() => {
      throw new TypeError("fetch failed");
    });

    const result = await client.refresh("1//refresh");

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("GoogleOAuthClient.revoke", () => {
  it("posts the token to the revoke endpoint", async () => {
    const { client, fetchImpl } = clientAnswering(() => new Response(null, { status: 200 }));

    const result = await client.revoke("1//refresh");

    expect(result.isSuccess).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(sentForm(fetchImpl).get("token")).toBe("1//refresh");
  });

  it("given Google refuses (HTTP 400), then a failure", async () => {
    const { client } = clientAnswering(() =>
      Response.json({ error: "invalid_token" }, { status: 400 }),
    );

    const result = await client.revoke("1//already-revoked");

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

describe("GoogleOAuthClient.profile", () => {
  it("reads the account email and given name with the bearer token", async () => {
    const { client, fetchImpl } = clientAnswering(() =>
      Response.json({ sub: "1", email: "lea@school.example", given_name: "Léa" }),
    );

    const result = await client.profile("ya29.live");

    expect(result.getValue().email).toBe("lea@school.example");
    expect(result.getValue().givenName.unwrap()).toBe("Léa");
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer ya29.live",
    );
  });

  it("given an answer without email, then CHILD_PROVIDER_FAILURE", async () => {
    const { client } = clientAnswering(() => Response.json({ sub: "1" }));

    const result = await client.profile("ya29.live");

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
  });
});

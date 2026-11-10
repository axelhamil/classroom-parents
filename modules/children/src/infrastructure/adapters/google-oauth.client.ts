import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { instrumentedFetch } from "@packages/http/instrumented-fetch";
import { z } from "zod";
import type { ChildrenSettings } from "../../application/config/children-settings";
import { invalidGrant } from "../../application/errors/children-errors";
import type { ChildrenError } from "../../application/ports/child-repository.port";
import type {
  GoogleAccess,
  GoogleProfile,
  IGoogleOAuthClient,
} from "../../application/ports/google-oauth-client.port";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const TIMEOUT_MS = 10_000;

const tokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
});

const tokenError = z.object({ error: z.string() });

const userInfoResponse = z.object({
  email: z.email(),
  given_name: z.string().optional(),
});

const providerFailure = (operation: string): ChildrenError => ({
  code: "CHILD_PROVIDER_FAILURE",
  message: `Google n'a pas répondu (${operation}). Réessayez dans un instant.`,
});

async function jsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export class GoogleOAuthClient implements IGoogleOAuthClient {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly settings: Pick<ChildrenSettings, "googleClientId" | "googleClientSecret">,
    private readonly fetchImpl: typeof fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async refresh(refreshToken: string): Promise<Result<GoogleAccess, ChildrenError>> {
    return this.instrumentation.startSpan({ name: "GoogleOAuthClient > refresh" }, async () => {
      const sent = await this.post(TOKEN_URL, {
        client_id: this.settings.googleClientId,
        client_secret: this.settings.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      if (sent.isFailure) return Result.fail(providerFailure("refresh"));

      const response = sent.getValue();
      const body = await jsonBody(response);
      if (!response.ok) {
        const refused = tokenError.safeParse(body);
        if (refused.success && refused.data.error === "invalid_grant")
          return Result.fail(invalidGrant);

        this.instrumentation.capture(new Error(`google token refresh answered ${response.status}`));
        return Result.fail(providerFailure("refresh"));
      }

      const parsed = tokenResponse.safeParse(body);
      if (!parsed.success) {
        this.instrumentation.capture(parsed.error);
        return Result.fail(providerFailure("refresh"));
      }

      return Result.ok({
        accessToken: parsed.data.access_token,
        expiresAt: new Date(this.clock().getTime() + parsed.data.expires_in * 1000),
        refreshToken: Option.fromNullable(parsed.data.refresh_token),
      });
    });
  }

  async revoke(token: string): Promise<Result<void, ChildrenError>> {
    return this.instrumentation.startSpan({ name: "GoogleOAuthClient > revoke" }, async () => {
      const sent = await this.post(REVOKE_URL, { token });
      if (sent.isFailure) return Result.fail(providerFailure("revoke"));

      const response = sent.getValue();
      if (response.ok) return Result.ok();

      const refused = tokenError.safeParse(await jsonBody(response));
      if (refused.success && refused.data.error === "invalid_token") return Result.ok();

      this.instrumentation.capture(new Error(`google token revoke answered ${response.status}`));
      return Result.fail(providerFailure("revoke"));
    });
  }

  async profile(accessToken: string): Promise<Result<GoogleProfile, ChildrenError>> {
    return this.instrumentation.startSpan({ name: "GoogleOAuthClient > profile" }, async () => {
      try {
        const response = await instrumentedFetch(
          this.instrumentation,
          this.fetchImpl,
          USERINFO_URL,
          {
            method: "GET",
            headers: { authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          },
        );
        const parsed = userInfoResponse.safeParse(await jsonBody(response));
        if (!response.ok || !parsed.success) {
          this.instrumentation.capture(new Error(`google userinfo answered ${response.status}`));
          return Result.fail(providerFailure("profile"));
        }

        return Result.ok({
          email: parsed.data.email,
          givenName: Option.fromNullable(parsed.data.given_name),
        });
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(providerFailure("profile"));
      }
    });
  }

  private async post(
    url: string,
    form: Record<string, string>,
  ): Promise<Result<Response, unknown>> {
    try {
      return Result.ok(
        await instrumentedFetch(this.instrumentation, this.fetchImpl, url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(form).toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      );
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail(err);
    }
  }
}

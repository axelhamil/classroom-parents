import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { accountNotLinked, childNotFound, invalidGrant } from "../errors/children-errors";
import type { ChildrenError, IChildRepository } from "../ports/child-repository.port";
import type { IGoogleCredentialStore } from "../ports/google-credential-store.port";
import type { GoogleProfile, IGoogleOAuthClient } from "../ports/google-oauth-client.port";
import type { ChildSyncService } from "./child-sync.service";

const ACCESS_TOKEN_SKEW_MS = 60_000;

export class GoogleAccessService {
  constructor(
    private readonly children: IChildRepository,
    private readonly credentials: IGoogleCredentialStore,
    private readonly google: IGoogleOAuthClient,
    private readonly sync: Pick<ChildSyncService, "markNeedsReconnect">,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async accessTokenFor(childId: string): Promise<Result<string, ChildrenError>> {
    return this.span("accessTokenFor", async () => {
      const found = await this.children.findForSystem(childId);
      if (found.isFailure) return Result.fail(found.getError());
      if (found.getValue().isNone()) return Result.fail(childNotFound);
      const child = found.getValue().unwrap();

      const token = await this.liveAccessToken(child.get("userId"), child.get("linkedAccountId"));
      if (token.isSuccess || token.getError().code !== "CHILD_TOKEN_INVALID_GRANT") return token;

      const marked = await this.sync.markNeedsReconnect(childId, "invalid_grant");
      if (marked.isFailure)
        this.instrumentation.capture(marked.getError(), { metadata: { childId } });
      return token;
    });
  }

  async profileOf(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<GoogleProfile, ChildrenError>> {
    return this.span("profileOf", async () => {
      const token = await this.liveAccessToken(userId, linkedAccountId);
      if (token.isFailure) return Result.fail(token.getError());

      return this.google.profile(token.getValue());
    });
  }

  async revokeGrant(userId: string, linkedAccountId: string): Promise<Result<void, ChildrenError>> {
    return this.span("revokeGrant", async () => {
      const read = await this.credentials.read(userId, linkedAccountId);
      if (read.isFailure) return Result.fail(read.getError());

      const grant = read.getValue().flatMap((stored) => stored.refreshToken.or(stored.accessToken));
      if (grant.isNone()) return Result.ok();

      return this.google.revoke(grant.unwrap());
    });
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `GoogleAccessService > ${method}`, op: "function" },
      work,
    );
  }

  private async liveAccessToken(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<string, ChildrenError>> {
    const read = await this.credentials.read(userId, linkedAccountId);
    if (read.isFailure) return Result.fail(read.getError());
    if (read.getValue().isNone()) return Result.fail(accountNotLinked);
    const stored = read.getValue().unwrap();

    const freshUntil = this.clock().getTime() + ACCESS_TOKEN_SKEW_MS;
    const live = stored.accessToken.filter(() =>
      stored.accessTokenExpiresAt.map((at) => at.getTime() > freshUntil).unwrapOr(false),
    );
    if (live.isSome()) return Result.ok(live.unwrap());
    if (stored.refreshToken.isNone()) return Result.fail(invalidGrant);

    const refreshed = await this.google.refresh(stored.refreshToken.unwrap());
    if (refreshed.isFailure) return Result.fail(refreshed.getError());

    const replaced = await this.credentials.replace(userId, linkedAccountId, refreshed.getValue());
    if (replaced.isFailure) return Result.fail(replaced.getError());

    return Result.ok(refreshed.getValue().accessToken);
  }
}

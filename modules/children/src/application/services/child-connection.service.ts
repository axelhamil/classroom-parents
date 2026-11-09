import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { ChildAccount, SYNC_LEASE_MS } from "../../domain/child-account.aggregate";
import { CHILD_LABEL_MAX, ChildLabel } from "../../domain/value-objects/child-label.vo";
import type { ReconnectCause } from "../../domain/value-objects/child-status.vo";
import { GoogleEmail } from "../../domain/value-objects/google-email.vo";
import type { ChildrenSettings } from "../config/children-settings";
import { type ChildDto, type LinkableAccount, toChildDto } from "../dto/child.dto";
import type { ChildrenError, DueChild, IChildRepository } from "../ports/child-repository.port";
import type { IGoogleCredentialStore } from "../ports/google-credential-store.port";
import type {
  IGoogleLinkedAccounts,
  LinkedGoogleAccount,
} from "../ports/google-linked-accounts.port";
import type { GoogleProfile, IGoogleOAuthClient } from "../ports/google-oauth-client.port";
import type { ILinkedAccountEraser } from "../ports/linked-account-eraser.port";

const ACCESS_TOKEN_SKEW_MS = 60_000;
const DEFAULT_LABEL = "Enfant";

export interface RegisterChildInput {
  linkedAccountId: string;
  label?: string;
}

export interface RevokeAllOutput {
  revoked: number;
  failed: number;
}

const notFound: ChildrenError = {
  code: "CHILD_NOT_FOUND",
  message: "Cet enfant n'existe pas ou n'est plus relié à votre compte.",
};

const notLinked: ChildrenError = {
  code: "CHILD_ACCOUNT_NOT_LINKED",
  message: "Ce compte Google n'est pas relié à votre compte. Ajoutez-le de nouveau.",
};

const scopesMissing: ChildrenError = {
  code: "CHILD_SCOPES_MISSING",
  message:
    "L'accès en lecture à Classroom n'a pas été accordé. Reconnectez le compte et cochez les deux autorisations Classroom.",
};

const refreshTokenMissing: ChildrenError = {
  code: "CHILD_REFRESH_TOKEN_MISSING",
  message:
    "Google n'a pas donné d'accès durable. Retirez l'accès de l'application dans le compte Google de votre enfant (Sécurité, Applications tierces), puis reconnectez-le.",
};

const alreadyConnected: ChildrenError = {
  code: "CHILD_ALREADY_CONNECTED",
  message: "Ce compte Google est déjà relié à l'un de vos enfants.",
};

const invalidGrant: ChildrenError = {
  code: "CHILD_TOKEN_INVALID_GRANT",
  message: "L'accès Google de cet enfant a expiré ou a été retiré. Reconnectez son compte.",
};

const profileUnreadable: ChildrenError = {
  code: "CHILD_PROVIDER_FAILURE",
  message: "Google n'a pas renvoyé l'adresse du compte. Réessayez dans un instant.",
};

export class ChildConnectionService {
  constructor(
    private readonly children: IChildRepository,
    private readonly linkedAccounts: IGoogleLinkedAccounts,
    private readonly credentials: IGoogleCredentialStore,
    private readonly google: IGoogleOAuthClient,
    private readonly eraser: ILinkedAccountEraser,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: Pick<ChildrenSettings, "classroomScopes">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  linkConfig(): { scopes: string[] } {
    return { scopes: [...this.settings.classroomScopes] };
  }

  async list(userId: string): Promise<Result<ChildDto[], ChildrenError>> {
    return this.span("list", async () => {
      const listed = await this.children.listForUser(userId);
      return listed.map((children) => children.map(toChildDto));
    });
  }

  async linkable(userId: string): Promise<Result<LinkableAccount[], ChildrenError>> {
    return this.span("linkable", async () => {
      const accounts = await this.linkedAccounts.listForUser(userId);
      if (accounts.isFailure) return Result.fail(accounts.getError());

      const children = await this.children.listForUser(userId);
      if (children.isFailure) return Result.fail(children.getError());

      const used = new Set(children.getValue().map((child) => child.get("linkedAccountId")));
      const candidates = accounts
        .getValue()
        .filter((account) => !used.has(account.linkedAccountId) && this.grantsSync(account));

      const linkable: LinkableAccount[] = [];
      for (const account of candidates) {
        const profile = await this.profileOf(userId, account.linkedAccountId);
        if (profile.isFailure && profile.getError().code === "CHILD_TOKEN_INVALID_GRANT") continue;
        if (profile.isFailure) return Result.fail(profile.getError());

        linkable.push({
          linkedAccountId: account.linkedAccountId,
          googleEmail: profile.getValue().email,
        });
      }
      return Result.ok(linkable);
    });
  }

  async register(
    userId: string,
    input: RegisterChildInput,
  ): Promise<Result<ChildDto, ChildrenError>> {
    return this.span("register", async () => {
      const usable = await this.usableLinkedAccount(userId, input.linkedAccountId);
      if (usable.isFailure) return Result.fail(usable.getError());

      const existing = await this.children.findByLinkedAccount(userId, input.linkedAccountId);
      if (existing.isFailure) return Result.fail(existing.getError());
      if (existing.getValue().isSome()) return Result.fail(alreadyConnected);

      const profile = await this.profileOf(userId, input.linkedAccountId);
      if (profile.isFailure) return Result.fail(profile.getError());

      const email = GoogleEmail.create(profile.getValue().email);
      if (email.isFailure) return Result.fail(profileUnreadable);

      const label = this.labelFor(input.label, profile.getValue());
      if (label.isFailure) return Result.fail(label.getError());

      const child = ChildAccount.create({
        userId,
        linkedAccountId: input.linkedAccountId,
        googleEmail: email.getValue(),
        label: label.getValue(),
        now: this.clock(),
      });

      const created = await this.transactions.run(async () => {
        const inserted = await this.children.create(child);
        if (inserted.isFailure) return inserted;

        await this.emitConnected(userId, child.id.value);
        return Result.ok<ChildrenError>();
      });
      if (created.isFailure) return Result.fail(created.getError());

      return Result.ok(toChildDto(child));
    });
  }

  async reconnect(userId: string, childId: string): Promise<Result<ChildDto, ChildrenError>> {
    return this.span("reconnect", () =>
      this.transactions.run(async () => {
        const found = await this.ownedChild(userId, childId);
        if (found.isFailure) return Result.fail(found.getError());
        const child = found.getValue();

        const usable = await this.usableLinkedAccount(userId, child.get("linkedAccountId"));
        if (usable.isFailure) return Result.fail(usable.getError());

        child.reconnect(this.clock());
        const saved = await this.children.save(child);
        if (saved.isFailure) return Result.fail(saved.getError());

        await this.emitConnected(userId, childId);
        return Result.ok(toChildDto(child));
      }),
    );
  }

  async rename(
    userId: string,
    childId: string,
    rawLabel: string,
  ): Promise<Result<ChildDto, ChildrenError>> {
    return this.span("rename", () =>
      this.transactions.run(async () => {
        const label = this.parseLabel(rawLabel);
        if (label.isFailure) return Result.fail(label.getError());

        const found = await this.ownedChild(userId, childId);
        if (found.isFailure) return Result.fail(found.getError());
        const child = found.getValue();

        child.rename(label.getValue());
        const saved = await this.children.save(child);
        if (saved.isFailure) return Result.fail(saved.getError());

        await emitEvent(this.outbox, EventTypes.CHILD_RENAMED, "child", childId, {
          userId,
          childId,
        });
        return Result.ok(toChildDto(child));
      }),
    );
  }

  async disconnect(userId: string, childId: string): Promise<Result<void, ChildrenError>> {
    return this.span("disconnect", async () => {
      const found = await this.ownedChild(userId, childId);
      if (found.isFailure) return Result.fail(found.getError());
      const child = found.getValue();
      const linkedAccountId = child.get("linkedAccountId");

      const revoked = await this.revokeGrant(userId, linkedAccountId);
      if (revoked.isFailure) this.instrumentation.capture(revoked.getError(), { userId });

      return this.transactions.run(async () => {
        const erased = await this.eraser.delete(userId, linkedAccountId);
        if (erased.isFailure) return erased;

        const deleted = await this.children.delete(userId, childId);
        if (deleted.isFailure) return deleted;

        await emitEvent(this.outbox, EventTypes.CHILD_DISCONNECTED, "child", childId, {
          userId,
          childId,
        });
        return Result.ok<ChildrenError>();
      });
    });
  }

  async revokeAllFor(userId: string): Promise<Result<RevokeAllOutput, ChildrenError>> {
    return this.span("revokeAllFor", async () => {
      const listed = await this.children.listForUser(userId);
      if (listed.isFailure) return Result.fail(listed.getError());

      const outcome: RevokeAllOutput = { revoked: 0, failed: 0 };
      for (const child of listed.getValue()) {
        const revoked = await this.revokeGrant(userId, child.get("linkedAccountId"));
        if (revoked.isSuccess) {
          outcome.revoked += 1;
          continue;
        }

        outcome.failed += 1;
        this.instrumentation.capture(revoked.getError(), { userId });
      }
      return Result.ok(outcome);
    });
  }

  async accessTokenFor(childId: string): Promise<Result<string, ChildrenError>> {
    return this.span("accessTokenFor", async () => {
      const found = await this.children.findForSystem(childId);
      if (found.isFailure) return Result.fail(found.getError());
      if (found.getValue().isNone()) return Result.fail(notFound);
      const child = found.getValue().unwrap();

      const token = await this.liveAccessToken(child.get("userId"), child.get("linkedAccountId"));
      if (token.isSuccess || token.getError().code !== "CHILD_TOKEN_INVALID_GRANT") return token;

      const marked = await this.markNeedsReconnect(childId, "invalid_grant");
      if (marked.isFailure)
        this.instrumentation.capture(marked.getError(), { metadata: { childId } });
      return token;
    });
  }

  async markNeedsReconnect(
    childId: string,
    cause: ReconnectCause,
  ): Promise<Result<void, ChildrenError>> {
    return this.span("markNeedsReconnect", () =>
      this.transactions.run(async () => {
        const found = await this.children.findForSystem(childId);
        if (found.isFailure) return Result.fail(found.getError());
        if (found.getValue().isNone()) return Result.fail(notFound);
        const child = found.getValue().unwrap();

        if (child.markNeedsReconnect(cause).isFailure) return Result.ok<ChildrenError>();

        const saved = await this.children.save(child);
        if (saved.isFailure) return saved;

        await emitEvent(this.outbox, EventTypes.CHILD_NEEDS_RECONNECT, "child", childId, {
          userId: child.get("userId"),
          childId,
          cause,
          actorUserId: null,
        });
        return Result.ok<ChildrenError>();
      }),
    );
  }

  async claimDueForSync(limit: number, now: Date): Promise<Result<DueChild[], ChildrenError>> {
    return this.span("claimDueForSync", () => this.children.claimDue(limit, now, SYNC_LEASE_MS));
  }

  async claimManualSync(
    userId: string,
    childId: string,
    now: Date,
  ): Promise<Result<"started" | "throttled", ChildrenError>> {
    return this.span("claimManualSync", () =>
      this.transactions.run(async () => {
        const found = await this.ownedChild(userId, childId);
        if (found.isFailure) return Result.fail(found.getError());
        const child = found.getValue();

        if (child.requestManualSync(now).isFailure)
          return Result.ok<"started" | "throttled", ChildrenError>("throttled");

        const saved = await this.children.save(child);
        if (saved.isFailure) return Result.fail(saved.getError());

        return Result.ok<"started" | "throttled", ChildrenError>("started");
      }),
    );
  }

  async markSynced(
    childId: string,
    at: Date,
    nextSyncAt: Date,
  ): Promise<Result<void, ChildrenError>> {
    return this.span("markSynced", () => this.children.markSynced(childId, at, nextSyncAt));
  }

  async markSyncFailed(childId: string, nextSyncAt: Date): Promise<Result<void, ChildrenError>> {
    return this.span("markSyncFailed", () => this.children.markSyncFailed(childId, nextSyncAt));
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `ChildConnectionService > ${method}`, op: "function" },
      work,
    );
  }

  private grantsSync(account: LinkedGoogleAccount): boolean {
    return (
      account.hasRefreshToken &&
      this.settings.classroomScopes.every((scope) => account.grantedScopes.includes(scope))
    );
  }

  private async usableLinkedAccount(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<LinkedGoogleAccount, ChildrenError>> {
    const found = await this.linkedAccounts.find(userId, linkedAccountId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.fail(notLinked);
    const account = found.getValue().unwrap();

    const granted = this.settings.classroomScopes.every((scope) =>
      account.grantedScopes.includes(scope),
    );
    if (!granted) return Result.fail(scopesMissing);
    if (!account.hasRefreshToken) return Result.fail(refreshTokenMissing);

    return Result.ok(account);
  }

  private async ownedChild(
    userId: string,
    childId: string,
  ): Promise<Result<ChildAccount, ChildrenError>> {
    const found = await this.children.findOwned(userId, childId);
    if (found.isFailure) return Result.fail(found.getError());

    return found.getValue().toResult(notFound);
  }

  private async liveAccessToken(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<string, ChildrenError>> {
    const read = await this.credentials.read(userId, linkedAccountId);
    if (read.isFailure) return Result.fail(read.getError());
    if (read.getValue().isNone()) return Result.fail(notLinked);
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

  private async profileOf(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<GoogleProfile, ChildrenError>> {
    const token = await this.liveAccessToken(userId, linkedAccountId);
    if (token.isFailure) return Result.fail(token.getError());

    return this.google.profile(token.getValue());
  }

  private async revokeGrant(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<void, ChildrenError>> {
    const read = await this.credentials.read(userId, linkedAccountId);
    if (read.isFailure) return Result.fail(read.getError());

    const token = read.getValue().flatMap((stored) => stored.refreshToken.or(stored.accessToken));
    if (token.isNone()) return Result.fail(invalidGrant);

    return this.google.revoke(token.unwrap());
  }

  private labelFor(
    requested: string | undefined,
    profile: GoogleProfile,
  ): Result<ChildLabel, ChildrenError> {
    if (requested !== undefined) return this.parseLabel(requested);

    const fallback = profile.givenName
      .or(Option.fromNullable(profile.email.split("@")[0]))
      .map((name) => name.trim().slice(0, CHILD_LABEL_MAX))
      .filter((name) => name.length > 0)
      .unwrapOr(DEFAULT_LABEL);
    return this.parseLabel(fallback);
  }

  private parseLabel(raw: string): Result<ChildLabel, ChildrenError> {
    return ChildLabel.create(raw).mapError(
      (): ChildrenError => ({
        code: "CHILD_LABEL_INVALID",
        message: "Le prénom affiché doit faire entre 1 et 40 caractères.",
      }),
    );
  }

  private async emitConnected(userId: string, childId: string): Promise<void> {
    await emitEvent(this.outbox, EventTypes.CHILD_CONNECTED, "child", childId, {
      userId,
      childId,
    });
  }
}

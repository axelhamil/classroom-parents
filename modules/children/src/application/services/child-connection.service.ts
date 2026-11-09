import { type IInstrumentation, type IUnitOfWork, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  ChildAccount,
  type ManualSyncRefusal,
  SYNC_LEASE_MS,
} from "../../domain/child-account.aggregate";
import { CHILD_LABEL_MAX, ChildLabel } from "../../domain/value-objects/child-label.vo";
import type { ChildStatusValue, ReconnectCause } from "../../domain/value-objects/child-status.vo";
import { GoogleEmail } from "../../domain/value-objects/google-email.vo";
import { CHILD_PROVIDER_ID } from "../config/child-provider";
import type { ChildrenSettings } from "../config/children-settings";
import { type ChildDto, type LinkableAccount, toChildDto } from "../dto/child.dto";
import type {
  ChildrenError,
  DueChild,
  IChildRepository,
  SyncLease,
} from "../ports/child-repository.port";
import type { IGoogleCredentialStore } from "../ports/google-credential-store.port";
import type {
  IGoogleLinkedAccounts,
  LinkedGoogleAccount,
} from "../ports/google-linked-accounts.port";
import type { GoogleProfile, IGoogleOAuthClient } from "../ports/google-oauth-client.port";
import type { ILinkedAccountEraser } from "../ports/linked-account-eraser.port";

type ErrorCode = ChildrenError["code"];

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

export type ManualSyncClaim =
  | { outcome: "started"; lease: SyncLease }
  | { outcome: "running" }
  | { outcome: "throttled" };

const UNUSABLE_LINK: readonly ErrorCode[] = [
  "CHILD_SCOPES_MISSING",
  "CHILD_REFRESH_TOKEN_MISSING",
  "CHILD_TOKEN_INVALID_GRANT",
];

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
    "L'accès en lecture à Classroom n'a pas été accordé. Reliez de nouveau le compte Google de votre enfant et cochez les deux autorisations Classroom.",
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

const SYNC_BLOCKED_MESSAGES: Record<Exclude<ChildStatusValue, "connected">, string> = {
  needs_reconnect: "Reconnectez le compte Google de cet enfant pour relancer la synchronisation.",
  blocked_by_school:
    "L'école bloque l'accès à Classroom pour ce compte. Transmettez-lui la procédure affichée sur la fiche de l'enfant.",
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
      const linkable: LinkableAccount[] = [];
      let refused = Option.none<ChildrenError>();
      for (const account of accounts.getValue()) {
        if (used.has(account.linkedAccountId)) continue;

        const usable = this.usability(account);
        const profile = usable.isSuccess
          ? await this.profileOf(userId, account.linkedAccountId)
          : Result.fail<GoogleProfile, ChildrenError>(usable.getError());
        if (profile.isSuccess) {
          linkable.push({
            linkedAccountId: account.linkedAccountId,
            googleEmail: profile.getValue().email,
          });
          continue;
        }

        const discarded = await this.refuseLink(
          userId,
          account.linkedAccountId,
          profile.getError(),
        );
        if (!UNUSABLE_LINK.includes(discarded.code)) return Result.fail(discarded);
        refused = Option.some(discarded);
      }

      if (linkable.length === 0 && refused.isSome()) return Result.fail(refused.unwrap());
      return Result.ok(linkable);
    });
  }

  async discardLinked(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<void, ChildrenError>> {
    return this.span("discardLinked", () =>
      this.transactions.run(async () => {
        const attached = await this.children.findByLinkedAccount(userId, linkedAccountId);
        if (attached.isFailure) return Result.fail(attached.getError());
        if (attached.getValue().isSome()) return Result.fail(alreadyConnected);

        const erased = await this.eraseLinked(userId, linkedAccountId, Option.none());
        return erased.map(() => undefined);
      }),
    );
  }

  async register(
    userId: string,
    input: RegisterChildInput,
  ): Promise<Result<ChildDto, ChildrenError>> {
    return this.span("register", async () => {
      const existing = await this.children.findByLinkedAccount(userId, input.linkedAccountId);
      if (existing.isFailure) return Result.fail(existing.getError());
      if (existing.getValue().isSome()) return Result.fail(alreadyConnected);

      const usable = await this.usableLinkedAccount(userId, input.linkedAccountId);
      if (usable.isFailure)
        return Result.fail(await this.refuseLink(userId, input.linkedAccountId, usable.getError()));

      const profile = await this.profileOf(userId, input.linkedAccountId);
      if (profile.isFailure)
        return Result.fail(
          await this.refuseLink(userId, input.linkedAccountId, profile.getError()),
        );

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
    return this.span("disconnect", () =>
      this.transactions.run(async () => {
        const found = await this.ownedChild(userId, childId);
        if (found.isFailure) return Result.fail(found.getError());
        const child = found.getValue();

        const erased = await this.eraseLinked(
          userId,
          child.get("linkedAccountId"),
          Option.some(child),
        );
        if (erased.isFailure && erased.getError().code === "CHILD_ACCOUNT_NOT_LINKED")
          return Result.fail(notFound);

        return erased.map(() => undefined);
      }),
    );
  }

  async revokeAllFor(userId: string): Promise<Result<RevokeAllOutput, ChildrenError>> {
    return this.span("revokeAllFor", async () => {
      const accounts = await this.linkedAccounts.listForUser(userId);
      if (accounts.isFailure) return Result.fail(accounts.getError());

      const outcome: RevokeAllOutput = { revoked: 0, failed: 0 };
      for (const { linkedAccountId } of accounts.getValue()) {
        const erased = await this.transactions.run(async () => {
          const attached = await this.children.findByLinkedAccount(userId, linkedAccountId);
          if (attached.isFailure)
            return Result.fail<{ revoked: boolean }, ChildrenError>(attached.getError());

          return this.eraseLinked(userId, linkedAccountId, attached.getValue());
        });
        if (erased.isFailure && erased.getError().code === "CHILD_ACCOUNT_NOT_LINKED") continue;
        if (erased.isFailure) this.instrumentation.capture(erased.getError(), { userId });

        if (erased.isSuccess && erased.getValue().revoked) outcome.revoked += 1;
        else outcome.failed += 1;
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
  ): Promise<Result<ManualSyncClaim, ChildrenError>> {
    return this.span("claimManualSync", () =>
      this.transactions.run(async () => {
        const found = await this.ownedChild(userId, childId);
        if (found.isFailure) return Result.fail(found.getError());
        const child = found.getValue();

        const requested = child.requestManualSync(now);
        if (requested.isFailure) return this.refusedManualSync(child, requested.getError());

        const saved = await this.children.save(child);
        if (saved.isFailure) return Result.fail(saved.getError());

        return Result.ok<ManualSyncClaim, ChildrenError>({
          outcome: "started",
          lease: { childId, lease: child.get("syncLease") },
        });
      }),
    );
  }

  async markSynced(
    lease: SyncLease,
    at: Date,
    nextSyncAt: Date,
  ): Promise<Result<void, ChildrenError>> {
    return this.span("markSynced", () => this.children.markSynced(lease, at, nextSyncAt));
  }

  async markSyncFailed(lease: SyncLease, nextSyncAt: Date): Promise<Result<void, ChildrenError>> {
    return this.span("markSyncFailed", () => this.children.markSyncFailed(lease, nextSyncAt));
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `ChildConnectionService > ${method}`, op: "function" },
      work,
    );
  }

  private usability(account: LinkedGoogleAccount): Result<void, ChildrenError> {
    const granted = this.settings.classroomScopes.every((scope) =>
      account.grantedScopes.includes(scope),
    );
    if (!granted) return Result.fail(scopesMissing);
    if (!account.hasRefreshToken) return Result.fail(refreshTokenMissing);

    return Result.ok();
  }

  private async usableLinkedAccount(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<void, ChildrenError>> {
    const found = await this.linkedAccounts.find(userId, linkedAccountId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone()) return Result.fail(notLinked);

    return this.usability(found.getValue().unwrap());
  }

  private refusedManualSync(
    child: ChildAccount,
    refusal: ManualSyncRefusal,
  ): Result<ManualSyncClaim, ChildrenError> {
    const status = child.get("status").value;
    if (refusal === "unavailable" && status !== "connected")
      return Result.fail({ code: "CHILD_SYNC_BLOCKED", message: SYNC_BLOCKED_MESSAGES[status] });
    if (refusal === "running") return Result.ok({ outcome: "running" });

    return Result.ok({ outcome: "throttled" });
  }

  private async refuseLink(
    userId: string,
    linkedAccountId: string,
    error: ChildrenError,
  ): Promise<ChildrenError> {
    if (!UNUSABLE_LINK.includes(error.code)) return error;

    const discarded = await this.transactions.run(() =>
      this.eraseLinked(userId, linkedAccountId, Option.none()),
    );
    if (discarded.isFailure) this.instrumentation.capture(discarded.getError(), { userId });
    return error;
  }

  private async eraseLinked(
    userId: string,
    linkedAccountId: string,
    child: Option<ChildAccount>,
  ): Promise<Result<{ revoked: boolean }, ChildrenError>> {
    const read = await this.credentials.read(userId, linkedAccountId);
    if (read.isFailure) return Result.fail(read.getError());
    const grant = read.getValue().flatMap((stored) => stored.refreshToken.or(stored.accessToken));

    const erased = await this.eraser.delete(userId, linkedAccountId);
    if (erased.isFailure) return Result.fail(erased.getError());
    if (erased.getValue().isNone()) return Result.fail(notLinked);

    const revoked = grant.isSome()
      ? await this.google.revoke(grant.unwrap())
      : Result.fail<void, ChildrenError>(invalidGrant);
    if (revoked.isFailure) this.instrumentation.capture(revoked.getError(), { userId });

    if (child.isSome()) {
      const childId = child.unwrap().id.value;
      const deleted = await this.children.delete(userId, childId);
      if (deleted.isFailure) return Result.fail(deleted.getError());

      await emitEvent(this.outbox, EventTypes.CHILD_DISCONNECTED, "child", childId, {
        userId,
        childId,
      });
      return Result.ok({ revoked: revoked.isSuccess });
    }

    await emitEvent(this.outbox, EventTypes.USER_ACCOUNT_UNLINKED, "account", linkedAccountId, {
      userId,
      providerId: CHILD_PROVIDER_ID,
      accountId: erased.getValue().unwrap().accountId,
    });
    return Result.ok({ revoked: revoked.isSuccess });
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

  private labelFor(
    requested: string | undefined,
    profile: GoogleProfile,
  ): Result<ChildLabel, ChildrenError> {
    if (requested !== undefined) return this.parseLabel(requested);

    const fallback = profile.givenName
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

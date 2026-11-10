import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type {
  ChildrenError,
  DisconnectingChild,
  IChildRepository,
} from "../application/ports/child-repository.port";
import type {
  GoogleCredentials,
  IGoogleCredentialStore,
} from "../application/ports/google-credential-store.port";
import type {
  IGoogleLinkedAccounts,
  LinkedGoogleAccount,
} from "../application/ports/google-linked-accounts.port";
import type {
  GoogleAccess,
  GoogleProfile,
  IGoogleOAuthClient,
} from "../application/ports/google-oauth-client.port";
import type {
  ErasedAccount,
  ILinkedAccountEraser,
} from "../application/ports/linked-account-eraser.port";
import { ChildConnectionService } from "../application/services/child-connection.service";
import { ChildAccount } from "../domain/child-account.aggregate";
import { ChildAccountId } from "../domain/child-account-id";
import { ChildLabel } from "../domain/value-objects/child-label.vo";
import {
  ChildStatus,
  type ChildStatusValue,
  type ReconnectCause,
} from "../domain/value-objects/child-status.vo";
import { GoogleEmail } from "../domain/value-objects/google-email.vo";

const NOW = new Date("2026-11-09T10:00:00.000Z");
const PARENT = "parent-1";
const LINKED = "account-1";
const CLASSROOM_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
];

function linkedAccount(overrides: Partial<LinkedGoogleAccount> = {}): LinkedGoogleAccount {
  return {
    linkedAccountId: LINKED,
    grantedScopes: ["openid", "email", "profile", ...CLASSROOM_SCOPES],
    hasRefreshToken: true,
    ...overrides,
  };
}

function credentials(overrides: Partial<GoogleCredentials> = {}): GoogleCredentials {
  return {
    accessToken: Option.some("ya29.live"),
    accessTokenExpiresAt: Option.some(new Date(NOW.getTime() + 30 * 60_000)),
    refreshToken: Option.some("1//refresh"),
    ...overrides,
  };
}

function child(
  overrides: {
    status?: ChildStatus;
    lastSyncRequestedAt?: Date;
    linkedAccountId?: string;
    syncStartedAt?: Date;
    nextSyncAt?: Date;
  } = {},
): ChildAccount {
  return ChildAccount.reconstitute(
    {
      userId: PARENT,
      linkedAccountId: overrides.linkedAccountId ?? LINKED,
      googleEmail: GoogleEmail.create("lea@school.example").getValue(),
      label: ChildLabel.create("Léa").getValue(),
      status: overrides.status ?? ChildStatus.connected(),
      connectedAt: new Date("2026-10-01T08:00:00.000Z"),
      lastSyncedAt: Option.none(),
      nextSyncAt: overrides.nextSyncAt ?? new Date("2026-11-09T12:00:00.000Z"),
      syncStartedAt: Option.fromNullable(overrides.syncStartedAt),
      lastSyncRequestedAt: Option.fromNullable(overrides.lastSyncRequestedAt),
      syncLease: 4,
    },
    new ChildAccountId(),
  );
}

const ok = <T>(value: T) => Result.ok<T, ChildrenError>(value);
const fail = <T>(code: ChildrenError["code"]) =>
  Result.fail<T, ChildrenError>({ code, message: code });

let repo: PortMock<IChildRepository>;
let linked: PortMock<IGoogleLinkedAccounts>;
let store: PortMock<IGoogleCredentialStore>;
let google: PortMock<IGoogleOAuthClient>;
let eraser: PortMock<ILinkedAccountEraser>;
let outbox: PortMock<IOutboxRepository>;
let instrumentation: ReturnType<typeof mockInstrumentation>;
let uow: UnitOfWorkMock;
let service: ChildConnectionService;
let revokedInsideTransaction: boolean[];

beforeEach(() => {
  repo = mockPort<IChildRepository>();
  linked = mockPort<IGoogleLinkedAccounts>();
  store = mockPort<IGoogleCredentialStore>();
  google = mockPort<IGoogleOAuthClient>();
  eraser = mockPort<ILinkedAccountEraser>();
  outbox = mockPort<IOutboxRepository>();
  instrumentation = mockInstrumentation();
  uow = mockUnitOfWork();

  repo.create.mockResolvedValue(Result.ok());
  repo.save.mockResolvedValue(Result.ok());
  repo.deleteLeased.mockResolvedValue(Result.ok());
  repo.releaseLease.mockResolvedValue(Result.ok());
  repo.findByLinkedAccount.mockResolvedValue(ok(Option.none<ChildAccount>()));
  repo.listForUser.mockResolvedValue(ok<ChildAccount[]>([]));
  linked.find.mockResolvedValue(ok(Option.some(linkedAccount())));
  store.read.mockResolvedValue(ok(Option.some(credentials())));
  store.replace.mockResolvedValue(Result.ok());
  google.profile.mockResolvedValue(
    ok<GoogleProfile>({ email: "lea@school.example", givenName: Option.some("Léa") }),
  );
  revokedInsideTransaction = [];
  google.revoke.mockImplementation(async () => {
    revokedInsideTransaction.push(UnitOfWorkContext.transaction() !== undefined);
    return Result.ok();
  });
  eraser.delete.mockResolvedValue(ok(Option.some<ErasedAccount>({ accountId: "google-sub-1" })));

  service = new ChildConnectionService(
    repo,
    linked,
    store,
    google,
    eraser,
    uow.unitOfWork,
    outbox,
    instrumentation,
    { classroomScopes: CLASSROOM_SCOPES },
    () => NOW,
  );
});

describe("register", () => {
  it("given a linked account with both scopes and a refresh token, then a connected child due now is persisted and CHILD_CONNECTED is enqueued without email", async () => {
    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toMatchObject({
      label: "Léa",
      googleEmail: "lea@school.example",
      status: "connected",
      syncing: false,
    });
    const persisted = repo.create.mock.calls[0]?.[0];
    expect(persisted?.get("nextSyncAt")).toEqual(NOW);
    expect(persisted?.get("userId")).toBe(PARENT);
    expect(persisted?.get("linkedAccountId")).toBe(LINKED);
    expect(uow.outcome()).toBe("committed");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CHILD_CONNECTED,
        aggregateId: result.getValue().id,
        payload: { userId: PARENT, childId: result.getValue().id },
      },
    ]);
  });

  it("given a label, then the child carries it trimmed", async () => {
    const result = await service.register(PARENT, { linkedAccountId: LINKED, label: "  Tom " });

    expect(result.getValue().label).toBe("Tom");
  });

  it("given an account missing announcements.readonly, then CHILD_SCOPES_MISSING", async () => {
    linked.find.mockResolvedValue(
      ok(Option.some(linkedAccount({ grantedScopes: ["openid", CLASSROOM_SCOPES[0] ?? ""] }))),
    );

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_SCOPES_MISSING");
    expect(repo.create).not.toHaveBeenCalled();
    expect(google.revoke).toHaveBeenCalledWith("1//refresh");
    expect(revokedInsideTransaction).toEqual([false]);
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
    expect(uow.outcome()).toBe("committed");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.USER_ACCOUNT_UNLINKED,
        aggregateId: LINKED,
        payload: { userId: PARENT, providerId: "google-classroom", accountId: "google-sub-1" },
      },
    ]);
  });

  it("given no refresh token, then CHILD_REFRESH_TOKEN_MISSING telling to remove the app access first", async () => {
    linked.find.mockResolvedValue(ok(Option.some(linkedAccount({ hasRefreshToken: false }))));

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_REFRESH_TOKEN_MISSING");
    expect(result.getError().message).toContain("compte Google");
    expect(repo.create).not.toHaveBeenCalled();
    expect(google.revoke).toHaveBeenCalled();
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
  });

  it("given the revoke of a refused link fails, then the account is kept for a retry and the typed error still returned", async () => {
    linked.find.mockResolvedValue(ok(Option.some(linkedAccount({ grantedScopes: ["openid"] }))));
    google.revoke.mockResolvedValue(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_SCOPES_MISSING");
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given Google answers invalid_grant while reading the profile, then the account is erased and CHILD_TOKEN_INVALID_GRANT", async () => {
    google.profile.mockResolvedValue(fail<GoogleProfile>("CHILD_TOKEN_INVALID_GRANT"));

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_TOKEN_INVALID_GRANT");
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("given no label, then the default label is the given name only", async () => {
    google.profile.mockResolvedValue(
      ok<GoogleProfile>({ email: "lea.martin@school.example", givenName: Option.some("Léa") }),
    );

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getValue().label).toBe("Léa");
  });

  it("given no label and no given name, then the neutral label, never the email", async () => {
    google.profile.mockResolvedValue(
      ok<GoogleProfile>({ email: "lea.martin@school.example", givenName: Option.none() }),
    );

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getValue().label).toBe("Enfant");
  });

  it("given the account is already used by a child, then CHILD_ALREADY_CONNECTED", async () => {
    repo.findByLinkedAccount.mockResolvedValue(ok(Option.some(child())));

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_ALREADY_CONNECTED");
    expect(repo.create).not.toHaveBeenCalled();
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given another user's account, then CHILD_ACCOUNT_NOT_LINKED", async () => {
    linked.find.mockResolvedValue(ok(Option.none<LinkedGoogleAccount>()));

    const result = await service.register(PARENT, { linkedAccountId: "someone-else" });

    expect(result.getError().code).toBe("CHILD_ACCOUNT_NOT_LINKED");
    expect(enqueuedEvents(outbox)).toEqual([]);
    expect(eraser.delete).not.toHaveBeenCalled();
  });
});

describe("reconnect", () => {
  it("given a blocked_by_school child whose account now has scopes and token, then connected, cause cleared, due now and CHILD_CONNECTED", async () => {
    const blocked = child({
      status: ChildStatus.brokenBy("school_blocked"),
      syncStartedAt: new Date(NOW.getTime() - 20 * 60_000),
      nextSyncAt: new Date(NOW.getTime() - 10 * 60_000),
    });
    repo.findOwned.mockResolvedValue(ok(Option.some(blocked)));

    const result = await service.reconnect(PARENT, blocked.id.value);

    expect(result.getValue()).toMatchObject({ status: "connected", cause: undefined });
    expect(blocked.get("nextSyncAt")).toEqual(NOW);
    expect(result.getValue().syncing).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(blocked);
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([EventTypes.CHILD_CONNECTED]);
  });

  it("given a connected child whose sync lease is still running, then its lease is kept and a manual sync answers running", async () => {
    const syncing = child({
      syncStartedAt: new Date(NOW.getTime() - 60_000),
      nextSyncAt: new Date(NOW.getTime() + 9 * 60_000),
    });
    repo.findOwned.mockResolvedValue(ok(Option.some(syncing)));

    const result = await service.reconnect(PARENT, syncing.id.value);
    const manual = await service.claimManualSync(PARENT, syncing.id.value, NOW);

    expect(result.getValue()).toMatchObject({ status: "connected", syncing: true });
    expect(syncing.get("syncLease")).toBe(4);
    expect(syncing.get("nextSyncAt")).toEqual(new Date(NOW.getTime() + 9 * 60_000));
    expect(manual.getValue()).toEqual({ outcome: "running" });
  });

  it("given still no refresh token, then CHILD_REFRESH_TOKEN_MISSING and status unchanged", async () => {
    const blocked = child({ status: ChildStatus.brokenBy("school_blocked") });
    repo.findOwned.mockResolvedValue(ok(Option.some(blocked)));
    linked.find.mockResolvedValue(ok(Option.some(linkedAccount({ hasRefreshToken: false }))));

    const result = await service.reconnect(PARENT, blocked.id.value);

    expect(result.getError().code).toBe("CHILD_REFRESH_TOKEN_MISSING");
    expect(blocked.get("status").value).toBe("blocked_by_school");
    expect(repo.save).not.toHaveBeenCalled();
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given a child being disconnected, then CHILD_NOT_FOUND and it stays disconnecting", async () => {
    const leaving = child({ status: ChildStatus.disconnecting() });
    repo.findOwned.mockResolvedValue(ok(Option.some(leaving)));

    const result = await service.reconnect(PARENT, leaving.id.value);

    expect(result.getError().code).toBe("CHILD_NOT_FOUND");
    expect(leaving.get("status").value).toBe("disconnecting");
  });

  it("given another family's child, then CHILD_NOT_FOUND", async () => {
    repo.findOwned.mockResolvedValue(ok(Option.none<ChildAccount>()));

    const result = await service.reconnect(PARENT, "child-of-b");

    expect(result.getError().code).toBe("CHILD_NOT_FOUND");
  });
});

describe("rename", () => {
  it("given the parent's child, then the new label is saved and CHILD_RENAMED is enqueued without the label", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.rename(PARENT, owned.id.value, " Lili ");

    expect(result.getValue().label).toBe("Lili");
    expect(repo.save).toHaveBeenCalledWith(owned);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CHILD_RENAMED,
        aggregateId: owned.id.value,
        payload: { userId: PARENT, childId: owned.id.value },
      },
    ]);
  });
});

describe("linkable", () => {
  it("excludes accounts already used by a child", async () => {
    linked.listForUser.mockResolvedValue(
      ok([linkedAccount({ linkedAccountId: "used" }), linkedAccount({ linkedAccountId: "free" })]),
    );
    repo.listForUser.mockResolvedValue(ok([child({ linkedAccountId: "used" })]));

    const result = await service.linkable(PARENT);

    expect(result.getValue()).toEqual([
      { linkedAccountId: "free", googleEmail: "lea@school.example" },
    ]);
  });

  it("given a fresh link without the Classroom scopes, then CHILD_SCOPES_MISSING naming it, and nothing is revoked nor erased", async () => {
    linked.listForUser.mockResolvedValue(
      ok([linkedAccount({ grantedScopes: ["openid", "email", "profile"] })]),
    );

    const result = await service.linkable(PARENT);

    expect(result.getError().code).toBe("CHILD_SCOPES_MISSING");
    expect(result.getError().metadata).toEqual({ unusableLinkedAccountIds: [LINKED] });
    expect(google.revoke).not.toHaveBeenCalled();
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given an unusable link next to a usable one, then only the usable one is listed and nothing is erased", async () => {
    linked.listForUser.mockResolvedValue(
      ok([
        linkedAccount({ linkedAccountId: "no-token", hasRefreshToken: false }),
        linkedAccount({ linkedAccountId: "free" }),
      ]),
    );

    const result = await service.linkable(PARENT);

    expect(result.getValue().map((a) => a.linkedAccountId)).toEqual(["free"]);
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given Google fails transiently for one account, then the other accounts are still listed", async () => {
    linked.listForUser.mockResolvedValue(
      ok([linkedAccount({ linkedAccountId: "flaky" }), linkedAccount({ linkedAccountId: "free" })]),
    );
    google.profile
      .mockResolvedValueOnce(fail<GoogleProfile>("CHILD_PROVIDER_FAILURE"))
      .mockResolvedValueOnce(
        ok<GoogleProfile>({ email: "tom@school.example", givenName: Option.none() }),
      );

    const result = await service.linkable(PARENT);

    expect(result.getValue()).toEqual([
      { linkedAccountId: "free", googleEmail: "tom@school.example" },
    ]);
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given Google fails transiently for the only account, then CHILD_PROVIDER_FAILURE naming it to retry", async () => {
    linked.listForUser.mockResolvedValue(ok([linkedAccount({ linkedAccountId: "flaky" })]));
    google.profile.mockResolvedValue(fail<GoogleProfile>("CHILD_PROVIDER_FAILURE"));

    const result = await service.linkable(PARENT);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
    expect(result.getError().metadata).toEqual({ retryLinkedAccountIds: ["flaky"] });
  });
});

describe("discardLinked", () => {
  it("given a linked account no child uses, then its token is revoked outside any transaction and the account erased", async () => {
    const result = await service.discardLinked(PARENT, LINKED);

    expect(result.isSuccess).toBe(true);
    expect(revokedInsideTransaction).toEqual([false]);
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([
      EventTypes.USER_ACCOUNT_UNLINKED,
    ]);
  });

  it("given Google fails the revoke, then the account is kept and CHILD_PROVIDER_FAILURE", async () => {
    google.revoke.mockResolvedValue(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.discardLinked(PARENT, LINKED);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
    expect(eraser.delete).not.toHaveBeenCalled();
  });

  it("given an account a child uses, then CHILD_ALREADY_CONNECTED and nothing revoked", async () => {
    repo.findByLinkedAccount.mockResolvedValue(ok(Option.some(child())));

    const result = await service.discardLinked(PARENT, LINKED);

    expect(result.getError().code).toBe("CHILD_ALREADY_CONNECTED");
    expect(google.revoke).not.toHaveBeenCalled();
  });

  it("given another family's account, then CHILD_ACCOUNT_NOT_LINKED and nothing revoked", async () => {
    store.read.mockResolvedValue(ok(Option.none<GoogleCredentials>()));
    eraser.delete.mockResolvedValue(ok(Option.none<ErasedAccount>()));

    const result = await service.discardLinked(PARENT, "someone-else");

    expect(result.getError().code).toBe("CHILD_ACCOUNT_NOT_LINKED");
    expect(google.revoke).not.toHaveBeenCalled();
  });
});

describe("accessTokenFor", () => {
  it("given an expired access token, then it refreshes once, stores the new token and returns it in clear", async () => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));
    store.read.mockResolvedValue(
      ok(
        Option.some(
          credentials({ accessTokenExpiresAt: Option.some(new Date(NOW.getTime() - 1000)) }),
        ),
      ),
    );
    const refreshed: GoogleAccess = {
      accessToken: "ya29.fresh",
      expiresAt: new Date(NOW.getTime() + 3600_000),
      refreshToken: Option.none(),
    };
    google.refresh.mockResolvedValue(ok(refreshed));

    const result = await service.accessTokenFor(owned.id.value);

    expect(result.getValue()).toBe("ya29.fresh");
    expect(google.refresh).toHaveBeenCalledTimes(1);
    expect(google.refresh).toHaveBeenCalledWith("1//refresh");
    expect(store.replace).toHaveBeenCalledWith(PARENT, LINKED, refreshed);
  });

  it("given a live access token, then no refresh", async () => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.accessTokenFor(owned.id.value);

    expect(result.getValue()).toBe("ya29.live");
    expect(google.refresh).not.toHaveBeenCalled();
  });

  it("given invalid_grant, then the child needs reconnect, CHILD_NEEDS_RECONNECT is enqueued and CHILD_TOKEN_INVALID_GRANT returned", async () => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));
    store.read.mockResolvedValue(ok(Option.some(credentials({ accessToken: Option.none() }))));
    google.refresh.mockResolvedValue(fail<GoogleAccess>("CHILD_TOKEN_INVALID_GRANT"));

    const result = await service.accessTokenFor(owned.id.value);

    expect(result.getError().code).toBe("CHILD_TOKEN_INVALID_GRANT");
    expect(owned.get("status").value).toBe("needs_reconnect");
    expect(repo.save).toHaveBeenCalledWith(owned);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CHILD_NEEDS_RECONNECT,
        aggregateId: owned.id.value,
        payload: {
          userId: PARENT,
          childId: owned.id.value,
          cause: "invalid_grant",
          actorUserId: null,
        },
      },
    ]);
  });
});

describe("markNeedsReconnect", () => {
  it.each<[ReconnectCause, ChildStatusValue]>([
    ["invalid_grant", "needs_reconnect"],
    ["school_blocked", "blocked_by_school"],
  ])("given cause %s, then status %s", async (cause, status) => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.markNeedsReconnect(owned.id.value, cause);

    expect(result.isSuccess).toBe(true);
    expect(owned.get("status").value).toBe(status);
    expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ cause });
  });

  it("given a child syncing when it breaks, then it no longer shows as syncing", async () => {
    const owned = child({ syncStartedAt: NOW, nextSyncAt: new Date(NOW.getTime() + 600_000) });
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    await service.markNeedsReconnect(owned.id.value, "school_blocked");

    expect(owned.get("syncStartedAt").isNone()).toBe(true);
  });

  it("given a child already in that state, then nothing is written nor emitted", async () => {
    const owned = child({ status: ChildStatus.brokenBy("school_blocked") });
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    await service.markNeedsReconnect(owned.id.value, "school_blocked");

    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("disconnect", () => {
  it("marks the child disconnecting and commits, revokes outside any transaction, then erases the account and the child", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.disconnect(PARENT, owned.id.value);

    expect(result.isSuccess).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(owned);
    expect(owned.get("status").value).toBe("disconnecting");
    expect(google.revoke).toHaveBeenCalledWith("1//refresh");
    expect(revokedInsideTransaction).toEqual([false]);
    expect(repo.deleteLeased).toHaveBeenCalledWith({ childId: owned.id.value, lease: 5 });
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([
      EventTypes.CHILD_DISCONNECT_REQUESTED,
      EventTypes.CHILD_DISCONNECTED,
    ]);
  });

  it("given Google fails the revoke, then the child stays disconnecting, its lease is released for a retry and nothing is erased", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));
    google.revoke.mockResolvedValue(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.disconnect(PARENT, owned.id.value);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
    expect(owned.get("status").value).toBe("disconnecting");
    expect(repo.releaseLease).toHaveBeenCalledWith({ childId: owned.id.value, lease: 5 }, NOW);
    expect(eraser.delete).not.toHaveBeenCalled();
    expect(repo.deleteLeased).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([
      EventTypes.CHILD_DISCONNECT_REQUESTED,
    ]);
  });

  it("given a disconnect already holding the lease, then accepted without a second revoke", async () => {
    const leaving = child({
      status: ChildStatus.disconnecting(),
      nextSyncAt: new Date(NOW.getTime() + 60_000),
    });
    repo.findOwned.mockResolvedValue(ok(Option.some(leaving)));

    const result = await service.disconnect(PARENT, leaving.id.value);

    expect(result.isSuccess).toBe(true);
    expect(google.revoke).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given a parent retrying a failed disconnect, then it is taken over and finished", async () => {
    const leaving = child({ status: ChildStatus.disconnecting(), nextSyncAt: NOW });
    repo.findOwned.mockResolvedValue(ok(Option.some(leaving)));

    const result = await service.disconnect(PARENT, leaving.id.value);

    expect(result.isSuccess).toBe(true);
    expect(google.revoke).toHaveBeenCalledTimes(1);
    expect(repo.deleteLeased).toHaveBeenCalledWith({ childId: leaving.id.value, lease: 5 });
  });

  it("given the final erasure fails, then it rolls back and the child stays disconnecting for a retry", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));
    eraser.delete.mockResolvedValue(fail<Option<ErasedAccount>>("CHILD_PROVIDER_FAILURE"));

    const result = await service.disconnect(PARENT, owned.id.value);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
    expect(uow.outcome()).toBe("rolled_back");
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([
      EventTypes.CHILD_DISCONNECT_REQUESTED,
    ]);
  });

  it("given another family's child, then CHILD_NOT_FOUND and nothing is revoked", async () => {
    repo.findOwned.mockResolvedValue(ok(Option.none<ChildAccount>()));

    const result = await service.disconnect(PARENT, "child-of-b");

    expect(result.getError().code).toBe("CHILD_NOT_FOUND");
    expect(google.revoke).not.toHaveBeenCalled();
    expect(eraser.delete).not.toHaveBeenCalled();
  });
});

describe("resumeDisconnections", () => {
  it("given a disconnect whose revoke failed, then the retry revokes outside any transaction and finishes it", async () => {
    const stuck: DisconnectingChild = {
      childId: "c1",
      userId: PARENT,
      linkedAccountId: LINKED,
      lease: 7,
    };
    repo.claimDisconnecting.mockResolvedValue(ok([stuck]));

    const result = await service.resumeDisconnections(10, NOW);

    expect(result.getValue()).toEqual({ finished: 1, failed: 0 });
    expect(revokedInsideTransaction).toEqual([false]);
    expect(repo.deleteLeased).toHaveBeenCalledWith({ childId: "c1", lease: 7 });
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([EventTypes.CHILD_DISCONNECTED]);
  });

  it("given Google still fails, then counted as failed and the lease released", async () => {
    const stuck: DisconnectingChild = {
      childId: "c1",
      userId: PARENT,
      linkedAccountId: LINKED,
      lease: 7,
    };
    repo.claimDisconnecting.mockResolvedValue(ok([stuck]));
    google.revoke.mockResolvedValue(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.resumeDisconnections(10, NOW);

    expect(result.getValue()).toEqual({ finished: 0, failed: 1 });
    expect(repo.releaseLease).toHaveBeenCalledWith({ childId: "c1", lease: 7 }, NOW);
    expect(eraser.delete).not.toHaveBeenCalled();
  });
});

describe("revokeAllFor", () => {
  it("given 2 children, 1 link no child uses and one Google refusal, then every revoke runs outside a transaction and {revoked: 2, failed: 1}", async () => {
    const lea = child({ linkedAccountId: "a" });
    const tom = child({ linkedAccountId: "b" });
    linked.listForUser.mockResolvedValue(
      ok([
        linkedAccount({ linkedAccountId: "a" }),
        linkedAccount({ linkedAccountId: "b" }),
        linkedAccount({ linkedAccountId: "orphan", grantedScopes: ["openid"] }),
      ]),
    );
    repo.findByLinkedAccount.mockImplementation(async (_userId, linkedAccountId) =>
      ok(Option.fromNullable({ a: lea, b: tom }[linkedAccountId])),
    );
    google.revoke
      .mockImplementationOnce(async () => {
        revokedInsideTransaction.push(UnitOfWorkContext.transaction() !== undefined);
        return Result.ok();
      })
      .mockResolvedValueOnce(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.revokeAllFor(PARENT);

    expect(result.getValue()).toEqual({ revoked: 2, failed: 1 });
    expect(revokedInsideTransaction).toEqual([false, false]);
    expect(tom.get("status").value).toBe("disconnecting");
    expect(eraser.delete.mock.calls.map(([, id]) => id)).toEqual(["a", "orphan"]);
    expect(
      enqueuedEvents(outbox)
        .filter((e) => e.eventType !== EventTypes.CHILD_DISCONNECT_REQUESTED)
        .map((e) => [e.eventType, e.aggregateId]),
    ).toEqual([
      [EventTypes.CHILD_DISCONNECTED, lea.id.value],
      [EventTypes.USER_ACCOUNT_UNLINKED, "orphan"],
    ]);
  });
});

describe("claimManualSync", () => {
  it("given an idle connected child, then started with a new lease and the child shows as syncing", async () => {
    const owned = child({ lastSyncRequestedAt: new Date(NOW.getTime() - 61_000) });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toEqual({
      outcome: "started",
      lease: { childId: owned.id.value, lease: 5 },
    });
    expect(owned.get("syncStartedAt").unwrap()).toEqual(NOW);
    expect(repo.save).toHaveBeenCalledWith(owned);
  });

  it("given a sync holding an active lease, then running and no second sync starts", async () => {
    const owned = child({
      syncStartedAt: new Date(NOW.getTime() - 5_000),
      nextSyncAt: new Date(NOW.getTime() + 595_000),
    });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toEqual({ outcome: "running" });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given a finished sync requested less than 60 s ago, then throttled", async () => {
    const owned = child({ lastSyncRequestedAt: new Date(NOW.getTime() - 59_000) });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toEqual({ outcome: "throttled" });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it.each<ReconnectCause>(["invalid_grant", "school_blocked"])(
    "given a child broken by %s, then CHILD_SYNC_BLOCKED and nothing starts",
    async (cause) => {
      const owned = child({ status: ChildStatus.brokenBy(cause) });
      repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

      const result = await service.claimManualSync(PARENT, owned.id.value, NOW);

      expect(result.getError().code).toBe("CHILD_SYNC_BLOCKED");
      expect(owned.get("syncStartedAt").isNone()).toBe(true);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
});

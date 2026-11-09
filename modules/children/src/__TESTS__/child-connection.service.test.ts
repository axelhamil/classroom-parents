import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type {
  ChildrenError,
  DueChild,
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
import type { ILinkedAccountEraser } from "../application/ports/linked-account-eraser.port";
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
  overrides: { status?: ChildStatus; lastSyncRequestedAt?: Date; linkedAccountId?: string } = {},
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
      nextSyncAt: new Date("2026-11-09T12:00:00.000Z"),
      syncStartedAt: Option.none(),
      lastSyncRequestedAt: Option.fromNullable(overrides.lastSyncRequestedAt),
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
  repo.delete.mockResolvedValue(Result.ok());
  repo.findByLinkedAccount.mockResolvedValue(ok(Option.none<ChildAccount>()));
  repo.listForUser.mockResolvedValue(ok<ChildAccount[]>([]));
  linked.find.mockResolvedValue(ok(Option.some(linkedAccount())));
  store.read.mockResolvedValue(ok(Option.some(credentials())));
  store.replace.mockResolvedValue(Result.ok());
  google.profile.mockResolvedValue(
    ok<GoogleProfile>({ email: "lea@school.example", givenName: Option.some("Léa") }),
  );
  google.revoke.mockResolvedValue(Result.ok());
  eraser.delete.mockResolvedValue(Result.ok());

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
  });

  it("given no refresh token, then CHILD_REFRESH_TOKEN_MISSING telling to remove the app access first", async () => {
    linked.find.mockResolvedValue(ok(Option.some(linkedAccount({ hasRefreshToken: false }))));

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_REFRESH_TOKEN_MISSING");
    expect(result.getError().message).toContain("compte Google");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("given the account is already used by a child, then CHILD_ALREADY_CONNECTED", async () => {
    repo.findByLinkedAccount.mockResolvedValue(ok(Option.some(child())));

    const result = await service.register(PARENT, { linkedAccountId: LINKED });

    expect(result.getError().code).toBe("CHILD_ALREADY_CONNECTED");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("given another user's account, then CHILD_ACCOUNT_NOT_LINKED", async () => {
    linked.find.mockResolvedValue(ok(Option.none<LinkedGoogleAccount>()));

    const result = await service.register(PARENT, { linkedAccountId: "someone-else" });

    expect(result.getError().code).toBe("CHILD_ACCOUNT_NOT_LINKED");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("reconnect", () => {
  it("given a blocked_by_school child whose account now has scopes and token, then connected, cause cleared, due now and CHILD_CONNECTED", async () => {
    const blocked = child({ status: ChildStatus.brokenBy("school_blocked") });
    repo.findOwned.mockResolvedValue(ok(Option.some(blocked)));

    const result = await service.reconnect(PARENT, blocked.id.value);

    expect(result.getValue()).toMatchObject({ status: "connected", cause: undefined });
    expect(blocked.get("nextSyncAt")).toEqual(NOW);
    expect(repo.save).toHaveBeenCalledWith(blocked);
    expect(enqueuedEvents(outbox).map((e) => e.eventType)).toEqual([EventTypes.CHILD_CONNECTED]);
  });

  it("given still no refresh token, then CHILD_REFRESH_TOKEN_MISSING and status unchanged", async () => {
    const blocked = child({ status: ChildStatus.brokenBy("school_blocked") });
    repo.findOwned.mockResolvedValue(ok(Option.some(blocked)));
    linked.find.mockResolvedValue(ok(Option.some(linkedAccount({ hasRefreshToken: false }))));

    const result = await service.reconnect(PARENT, blocked.id.value);

    expect(result.getError().code).toBe("CHILD_REFRESH_TOKEN_MISSING");
    expect(blocked.get("status").value).toBe("blocked_by_school");
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given another family's child, then CHILD_NOT_FOUND", async () => {
    repo.findOwned.mockResolvedValue(ok(Option.none<ChildAccount>()));

    const result = await service.reconnect(PARENT, "child-of-b");

    expect(result.getError().code).toBe("CHILD_NOT_FOUND");
  });
});

describe("linkable", () => {
  it("excludes the parent's own sign-in account and accounts already used by a child", async () => {
    linked.listForUser.mockResolvedValue(
      ok([
        linkedAccount({
          linkedAccountId: "parent-sign-in",
          grantedScopes: ["openid", "email", "profile"],
          hasRefreshToken: false,
        }),
        linkedAccount({ linkedAccountId: "used" }),
        linkedAccount({ linkedAccountId: "free" }),
      ]),
    );
    repo.listForUser.mockResolvedValue(ok([child({ linkedAccountId: "used" })]));

    const result = await service.linkable(PARENT);

    expect(result.getValue()).toEqual([
      { linkedAccountId: "free", googleEmail: "lea@school.example" },
    ]);
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

  it("given a child already in that state, then nothing is written nor emitted", async () => {
    const owned = child({ status: ChildStatus.brokenBy("school_blocked") });
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    await service.markNeedsReconnect(owned.id.value, "school_blocked");

    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("disconnect", () => {
  it("given Google refuses the revoke, then the account row and the child are still deleted and the failure is captured", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));
    google.revoke.mockResolvedValue(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.disconnect(PARENT, owned.id.value);

    expect(result.isSuccess).toBe(true);
    expect(google.revoke).toHaveBeenCalledWith("1//refresh");
    expect(instrumentation.capture).toHaveBeenCalled();
    expect(eraser.delete).toHaveBeenCalledWith(PARENT, LINKED);
    expect(repo.delete).toHaveBeenCalledWith(PARENT, owned.id.value);
    expect(uow.outcome()).toBe("committed");
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CHILD_DISCONNECTED,
        aggregateId: owned.id.value,
        payload: { userId: PARENT, childId: owned.id.value },
      },
    ]);
  });

  it("given the account row cannot be erased, then nothing is committed nor emitted", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));
    eraser.delete.mockResolvedValue(fail<void>("CHILD_PROVIDER_FAILURE"));

    const result = await service.disconnect(PARENT, owned.id.value);

    expect(result.getError().code).toBe("CHILD_PROVIDER_FAILURE");
    expect(uow.outcome()).toBe("rolled_back");
    expect(uow.writtenEvents()).toEqual([]);
  });

  it("given another family's child, then CHILD_NOT_FOUND and nothing is revoked", async () => {
    repo.findOwned.mockResolvedValue(ok(Option.none<ChildAccount>()));

    const result = await service.disconnect(PARENT, "child-of-b");

    expect(result.getError().code).toBe("CHILD_NOT_FOUND");
    expect(google.revoke).not.toHaveBeenCalled();
    expect(eraser.delete).not.toHaveBeenCalled();
  });
});

describe("revokeAllFor", () => {
  it("given 3 children and one Google refusal, then {revoked: 2, failed: 1} as a success", async () => {
    repo.listForUser.mockResolvedValue(
      ok([
        child({ linkedAccountId: "a" }),
        child({ linkedAccountId: "b" }),
        child({ linkedAccountId: "c" }),
      ]),
    );
    google.revoke
      .mockResolvedValueOnce(Result.ok())
      .mockResolvedValueOnce(fail<void>("CHILD_PROVIDER_FAILURE"))
      .mockResolvedValueOnce(Result.ok());

    const result = await service.revokeAllFor(PARENT);

    expect(result.getValue()).toEqual({ revoked: 2, failed: 1 });
  });
});

describe("claimManualSync", () => {
  it("given two requests within 60 s, then the second is throttled", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const first = await service.claimManualSync(PARENT, owned.id.value, NOW);
    const second = await service.claimManualSync(
      PARENT,
      owned.id.value,
      new Date(NOW.getTime() + 59_000),
    );

    expect(first.getValue()).toBe("started");
    expect(second.getValue()).toBe("throttled");
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it("given the last request is older than 60 s, then started and the child shows as syncing", async () => {
    const owned = child({ lastSyncRequestedAt: new Date(NOW.getTime() - 61_000) });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await service.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toBe("started");
    expect(owned.get("syncStartedAt").unwrap()).toEqual(NOW);
  });
});

describe("claimDueForSync", () => {
  it("claims with the 10 minute lease", async () => {
    const due: DueChild[] = [{ childId: "c1", userId: PARENT, label: "Léa" }];
    repo.claimDue.mockResolvedValue(ok(due));

    const result = await service.claimDueForSync(5, NOW);

    expect(result.getValue()).toEqual(due);
    expect(repo.claimDue).toHaveBeenCalledWith(5, NOW, 10 * 60_000);
  });
});

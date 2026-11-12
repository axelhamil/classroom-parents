import { Option, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { CLASSROOM_SCOPES } from "../application/config/classroom-scopes";
import type { ChildrenError, IChildRepository } from "../application/ports/child-repository.port";
import type {
  GoogleCredentials,
  IGoogleCredentialStore,
} from "../application/ports/google-credential-store.port";
import type {
  IGoogleLinkedAccounts,
  LinkedGoogleAccount,
} from "../application/ports/google-linked-accounts.port";
import type {
  GoogleProfile,
  IGoogleOAuthClient,
} from "../application/ports/google-oauth-client.port";
import type {
  ErasedAccount,
  ILinkedAccountEraser,
} from "../application/ports/linked-account-eraser.port";
import { ChildConnectionService } from "../application/services/child-connection.service";
import { ChildSyncService } from "../application/services/child-sync.service";
import { GoogleAccessService } from "../application/services/google-access.service";
import { ChildAccount } from "../domain/child-account.aggregate";
import { ChildAccountId } from "../domain/child-account-id";
import { AvatarUrl } from "../domain/value-objects/avatar-url.vo";
import { ChildColor, type ChildColorValue } from "../domain/value-objects/child-color.vo";
import { ChildLabel } from "../domain/value-objects/child-label.vo";
import { ChildStatus } from "../domain/value-objects/child-status.vo";
import { GoogleEmail } from "../domain/value-objects/google-email.vo";

export const NOW = new Date("2026-11-09T10:00:00.000Z");
export const PARENT = "parent-1";
export const CLIENT_ID = "school-client.apps.googleusercontent.com";
export const LINKED = "account-1";
export const LEA_PICTURE = "https://lh3.googleusercontent.com/a/lea";

export function linkedAccount(overrides: Partial<LinkedGoogleAccount> = {}): LinkedGoogleAccount {
  return {
    linkedAccountId: LINKED,
    grantedScopes: ["openid", "email", "profile", ...CLASSROOM_SCOPES],
    hasRefreshToken: true,
    ...overrides,
  };
}

export function credentials(overrides: Partial<GoogleCredentials> = {}): GoogleCredentials {
  return {
    accessToken: Option.some("ya29.live"),
    accessTokenExpiresAt: Option.some(new Date(NOW.getTime() + 30 * 60_000)),
    refreshToken: Option.some("1//refresh"),
    ...overrides,
  };
}

export function child(
  overrides: {
    status?: ChildStatus;
    lastSyncRequestedAt?: Date;
    linkedAccountId?: string;
    syncStartedAt?: Date;
    nextSyncAt?: Date;
    color?: ChildColorValue;
    avatarUrl?: string;
  } = {},
): ChildAccount {
  return ChildAccount.reconstitute(
    {
      userId: PARENT,
      linkedAccountId: overrides.linkedAccountId ?? LINKED,
      googleEmail: GoogleEmail.create("lea@school.example").getValue(),
      label: ChildLabel.create("Léa").getValue(),
      color: ChildColor.create(overrides.color ?? 1).getValue(),
      avatarUrl: Option.fromNullable(overrides.avatarUrl).map((url) =>
        AvatarUrl.create(url).getValue(),
      ),
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

export const ok = <T>(value: T) => Result.ok<T, ChildrenError>(value);
export const fail = <T>(code: ChildrenError["code"]) =>
  Result.fail<T, ChildrenError>({ code, message: code });

export interface ChildrenHarness {
  repo: PortMock<IChildRepository>;
  linked: PortMock<IGoogleLinkedAccounts>;
  store: PortMock<IGoogleCredentialStore>;
  google: PortMock<IGoogleOAuthClient>;
  eraser: PortMock<ILinkedAccountEraser>;
  outbox: PortMock<IOutboxRepository>;
  uow: UnitOfWorkMock;
  revokedInsideTransaction: boolean[];
  sync: ChildSyncService;
  access: GoogleAccessService;
  connection: ChildConnectionService;
}

export function childrenHarness(): ChildrenHarness {
  const repo = mockPort<IChildRepository>();
  const linked = mockPort<IGoogleLinkedAccounts>();
  const store = mockPort<IGoogleCredentialStore>();
  const google = mockPort<IGoogleOAuthClient>();
  const eraser = mockPort<ILinkedAccountEraser>();
  const outbox = mockPort<IOutboxRepository>();
  const instrumentation = mockInstrumentation();
  const uow = mockUnitOfWork();
  const revokedInsideTransaction: boolean[] = [];

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
    ok<GoogleProfile>({
      email: "lea@school.example",
      givenName: Option.some("Léa"),
      picture: Option.some(LEA_PICTURE),
    }),
  );
  google.revoke.mockImplementation(async () => {
    revokedInsideTransaction.push(UnitOfWorkContext.transaction() !== undefined);
    return Result.ok();
  });
  eraser.delete.mockResolvedValue(ok(Option.some<ErasedAccount>({ accountId: "google-sub-1" })));

  const sync = new ChildSyncService(repo, uow.unitOfWork, outbox, instrumentation);
  const access = new GoogleAccessService(repo, store, google, sync, instrumentation, () => NOW);
  const connection = new ChildConnectionService(
    repo,
    linked,
    access,
    eraser,
    uow.unitOfWork,
    outbox,
    instrumentation,
    { classroomScopes: CLASSROOM_SCOPES, googleClientId: CLIENT_ID },
    () => NOW,
  );

  return {
    repo,
    linked,
    store,
    google,
    eraser,
    outbox,
    uow,
    revokedInsideTransaction,
    sync,
    access,
    connection,
  };
}

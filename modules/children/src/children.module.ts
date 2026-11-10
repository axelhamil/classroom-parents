import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { ChildrenSettings } from "./application/config/children-settings";
import type { IChildRepository } from "./application/ports/child-repository.port";
import type {
  IGoogleCredentialStore,
  TokenSealing,
} from "./application/ports/google-credential-store.port";
import type { IGoogleLinkedAccounts } from "./application/ports/google-linked-accounts.port";
import type { IGoogleOAuthClient } from "./application/ports/google-oauth-client.port";
import type { ILinkedAccountEraser } from "./application/ports/linked-account-eraser.port";
import { ChildConnectionService } from "./application/services/child-connection.service";
import { DrizzleGoogleCredentialStore } from "./infrastructure/adapters/drizzle-google-credential.store";
import { DrizzleGoogleLinkedAccounts } from "./infrastructure/adapters/drizzle-google-linked-accounts";
import { DrizzleLinkedAccountEraser } from "./infrastructure/adapters/drizzle-linked-account.eraser";
import { GoogleOAuthClient } from "./infrastructure/adapters/google-oauth.client";
import { DrizzleChildRepository } from "./infrastructure/repositories/drizzle-child.repository";

export interface ChildrenPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  googleTokenSealing: TokenSealing;
  childrenSettings: ChildrenSettings;
}

export const childrenModule = defineModule<ChildrenPrerequisites>()((b) =>
  b
    .add(
      "IChildRepository",
      (c): IChildRepository => new DrizzleChildRepository(c.IInstrumentation),
    )
    .add(
      "IGoogleLinkedAccounts",
      (c): IGoogleLinkedAccounts => new DrizzleGoogleLinkedAccounts(c.IInstrumentation),
    )
    .add(
      "IGoogleCredentialStore",
      (c): IGoogleCredentialStore =>
        new DrizzleGoogleCredentialStore(c.googleTokenSealing, c.IInstrumentation),
    )
    .add(
      "ILinkedAccountEraser",
      (c): ILinkedAccountEraser => new DrizzleLinkedAccountEraser(c.IInstrumentation),
    )
    .add(
      "IGoogleOAuthClient",
      (c): IGoogleOAuthClient =>
        new GoogleOAuthClient(c.IInstrumentation, c.childrenSettings, fetch),
    )
    .add(
      "ChildConnectionService",
      (c) =>
        new ChildConnectionService(
          c.IChildRepository,
          c.IGoogleLinkedAccounts,
          c.IGoogleCredentialStore,
          c.IGoogleOAuthClient,
          c.ILinkedAccountEraser,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.childrenSettings,
        ),
    ),
);

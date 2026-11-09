import { Result } from "@packages/ddd-kit";
import { defineModule } from "inwire";
import type { IChildConnections } from "../modules/rgpd/application/ports/child-connections.port";

const noChildModuleComposed: IChildConnections = {
  revokeAll: async () => Result.ok({ revoked: 0, failed: 0 }),
};

export const childConnectionsBinding = defineModule<Record<never, never>>()((b) =>
  b.add("IChildConnections", (): IChildConnections => noChildModuleComposed),
);

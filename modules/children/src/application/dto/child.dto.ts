import { z } from "zod";
import type { ChildAccount } from "../../domain/child-account.aggregate";
import { childLabelSchema } from "../../domain/value-objects/child-label.vo";
import type { ChildStatusValue, ReconnectCause } from "../../domain/value-objects/child-status.vo";

export interface ChildDto {
  id: string;
  label: string;
  googleEmail: string;
  status: ChildStatusValue;
  cause?: ReconnectCause;
  lastSyncedAt?: string;
  syncing: boolean;
}

export interface LinkableAccount {
  linkedAccountId: string;
  googleEmail: string;
}

export const registerChildBodySchema = z.object({
  linkedAccountId: z.string().min(1),
  label: childLabelSchema.optional(),
});

export const renameChildBodySchema = z.object({ label: childLabelSchema });

export const childIdParamSchema = z.object({ id: z.uuid() });

export const linkedAccountParamSchema = z.object({ linkedAccountId: z.string().min(1) });

export function toChildDto(child: ChildAccount): ChildDto {
  const status = child.get("status");

  return {
    id: child.id.value,
    label: child.get("label").value,
    googleEmail: child.get("googleEmail").value,
    status: status.value,
    cause: status.cause().toUndefined(),
    lastSyncedAt: child
      .get("lastSyncedAt")
      .map((at) => at.toISOString())
      .toUndefined(),
    syncing: child.get("syncStartedAt").isSome(),
  };
}

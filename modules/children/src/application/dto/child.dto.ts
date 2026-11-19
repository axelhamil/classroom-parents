import { z } from "zod";
import type { ChildAccount } from "../../domain/child-account.aggregate";
import { type ChildColorValue, childColorSchema } from "../../domain/value-objects/child-color.vo";
import { childLabelSchema } from "../../domain/value-objects/child-label.vo";
import type { ChildStatusValue, ReconnectCause } from "../../domain/value-objects/child-status.vo";

export interface ChildDto {
  id: string;
  label: string;
  color: ChildColorValue;
  avatarUrl: string | null;
  showsPhoto: boolean;
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
  color: childColorSchema.optional(),
});

export const editChildBodySchema = z
  .object({
    label: childLabelSchema.optional(),
    color: childColorSchema.optional(),
    showsPhoto: z.boolean().optional(),
  })
  .refine((body) => Object.values(body).some((change) => change !== undefined), {
    message: "Indiquez un prénom, une couleur ou un avatar à modifier.",
  });

export const childIdParamSchema = z.object({ id: z.uuid() });

export const linkedAccountParamSchema = z.object({ linkedAccountId: z.string().min(1) });

export function toChildDto(child: ChildAccount): ChildDto {
  const status = child.get("status");

  return {
    id: child.id.value,
    label: child.get("label").value,
    color: child.get("color").value,
    avatarUrl: child
      .get("avatarUrl")
      .map((avatar) => avatar.value)
      .toNull(),
    showsPhoto: child.get("showsPhoto"),
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

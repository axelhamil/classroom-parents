import type { z } from "zod";
import type { RetentionPolicy } from "./retention-map";
import type { Visibility } from "./visibility-map";

export interface EventContribution<
  Types extends Record<string, string>,
  Payloads extends Record<Types[keyof Types], z.ZodType>,
> {
  types: Types;
  payloads: Payloads;
  /**
   * Stricter schemas the outbox enforces when an event is emitted, for types whose `payloads`
   * entry also reads an older stored shape. An event already queued must never be rejected by a
   * deploy, while a new emit must still carry every field.
   */
  emitted?: Partial<Record<Types[keyof Types], z.ZodType>>;
  retention: Record<Types[keyof Types], RetentionPolicy>;
  visibility: Record<Types[keyof Types], Visibility>;
  descriptions: Record<Types[keyof Types], string>;
}

export function defineEventContribution<
  const Types extends Record<string, string>,
  const Payloads extends Record<Types[keyof Types], z.ZodType>,
>(contribution: EventContribution<Types, Payloads>): EventContribution<Types, Payloads> {
  return contribution;
}

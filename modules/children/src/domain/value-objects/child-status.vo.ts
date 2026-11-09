import { Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const CHILD_STATUSES = [
  "connected",
  "needs_reconnect",
  "blocked_by_school",
  "disconnecting",
] as const;
export const RECONNECT_CAUSES = ["invalid_grant", "school_blocked"] as const;

export type ChildStatusValue = (typeof CHILD_STATUSES)[number];
export type ReconnectCause = (typeof RECONNECT_CAUSES)[number];

const childStatusSchema = z.enum(CHILD_STATUSES);

const STATUS_BY_CAUSE = {
  invalid_grant: "needs_reconnect",
  school_blocked: "blocked_by_school",
} as const satisfies Record<ReconnectCause, ChildStatusValue>;

export class ChildStatus extends ValueObject<ChildStatusValue> {
  static connected(): ChildStatus {
    return new ChildStatus("connected");
  }

  static disconnecting(): ChildStatus {
    return new ChildStatus("disconnecting");
  }

  static brokenBy(cause: ReconnectCause): ChildStatus {
    return new ChildStatus(STATUS_BY_CAUSE[cause]);
  }

  cause(): Option<ReconnectCause> {
    if (this.value === "needs_reconnect") return Option.some("invalid_grant");
    if (this.value === "blocked_by_school") return Option.some("school_blocked");

    return Option.none();
  }

  protected validate(value: ChildStatusValue): Result<ChildStatusValue> {
    const parsed = childStatusSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown child status ${String(value)}`);

    return Result.ok(parsed.data);
  }
}

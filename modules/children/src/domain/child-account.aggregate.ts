import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { ChildAccountId } from "./child-account-id";
import type { ChildLabel } from "./value-objects/child-label.vo";
import { ChildStatus, type ReconnectCause } from "./value-objects/child-status.vo";
import type { GoogleEmail } from "./value-objects/google-email.vo";

export const MANUAL_SYNC_THROTTLE_MS = 60_000;
export const SYNC_LEASE_MS = 10 * 60_000;
export const DISCONNECT_LEASE_MS = 2 * 60_000;

export interface ChildAccountProps {
  userId: string;
  linkedAccountId: string;
  googleEmail: GoogleEmail;
  label: ChildLabel;
  status: ChildStatus;
  connectedAt: Date;
  lastSyncedAt: Option<Date>;
  nextSyncAt: Date;
  syncStartedAt: Option<Date>;
  lastSyncRequestedAt: Option<Date>;
  syncLease: number;
}

export type ManualSyncRefusal = "unavailable" | "running" | "throttled";

export interface NewChildAccount {
  userId: string;
  linkedAccountId: string;
  googleEmail: GoogleEmail;
  label: ChildLabel;
  now: Date;
}

export class ChildAccount extends Aggregate<ChildAccountProps, ChildAccountId> {
  private constructor(props: ChildAccountProps, id: ChildAccountId) {
    super(props, id);
  }

  static create(input: NewChildAccount): ChildAccount {
    return new ChildAccount(
      {
        userId: input.userId,
        linkedAccountId: input.linkedAccountId,
        googleEmail: input.googleEmail,
        label: input.label,
        status: ChildStatus.connected(),
        connectedAt: input.now,
        lastSyncedAt: Option.none(),
        nextSyncAt: input.now,
        syncStartedAt: Option.none(),
        lastSyncRequestedAt: Option.none(),
        syncLease: 0,
      },
      new ChildAccountId(),
    );
  }

  static reconstitute(props: ChildAccountProps, id: ChildAccountId): ChildAccount {
    return new ChildAccount(props, id);
  }

  rename(label: ChildLabel): void {
    this._props.label = label;
  }

  reconnect(now: Date): Result<void, "disconnecting"> {
    if (this.isDisconnecting()) return Result.fail("disconnecting");

    this._props.status = ChildStatus.connected();
    this._props.nextSyncAt = now;
    this._props.syncStartedAt = Option.none();
    this._props.syncLease += 1;
    return Result.ok();
  }

  beginDisconnect(now: Date): Result<void, "in_progress"> {
    if (this.isDisconnecting() && this._props.nextSyncAt > now) return Result.fail("in_progress");

    this._props.status = ChildStatus.disconnecting();
    this._props.syncStartedAt = Option.none();
    this._props.nextSyncAt = new Date(now.getTime() + DISCONNECT_LEASE_MS);
    this._props.syncLease += 1;
    return Result.ok();
  }

  isDisconnecting(): boolean {
    return this._props.status.value === "disconnecting";
  }

  markNeedsReconnect(cause: ReconnectCause): Result<void, "unchanged"> {
    const broken = ChildStatus.brokenBy(cause);
    if (this._props.status.equals(broken) || this.isDisconnecting())
      return Result.fail("unchanged");

    this._props.status = broken;
    this._props.syncStartedAt = Option.none();
    return Result.ok();
  }

  requestManualSync(now: Date): Result<void, ManualSyncRefusal> {
    if (this._props.status.value !== "connected") return Result.fail("unavailable");

    const leased = this._props.syncStartedAt.isSome() && this._props.nextSyncAt > now;
    if (leased) return Result.fail("running");

    const last = this._props.lastSyncRequestedAt;
    if (last.isSome() && now.getTime() - last.unwrap().getTime() < MANUAL_SYNC_THROTTLE_MS)
      return Result.fail("throttled");

    this._props.lastSyncRequestedAt = Option.some(now);
    this._props.syncStartedAt = Option.some(now);
    this._props.nextSyncAt = new Date(now.getTime() + SYNC_LEASE_MS);
    this._props.syncLease += 1;
    return Result.ok();
  }
}

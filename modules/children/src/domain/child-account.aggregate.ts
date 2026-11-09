import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { ChildAccountId } from "./child-account-id";
import type { ChildLabel } from "./value-objects/child-label.vo";
import { ChildStatus, type ReconnectCause } from "./value-objects/child-status.vo";
import type { GoogleEmail } from "./value-objects/google-email.vo";

export const MANUAL_SYNC_THROTTLE_MS = 60_000;
export const SYNC_LEASE_MS = 10 * 60_000;

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
}

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

  reconnect(now: Date): void {
    this._props.status = ChildStatus.connected();
    this._props.nextSyncAt = now;
  }

  markNeedsReconnect(cause: ReconnectCause): Result<void, "unchanged"> {
    const broken = ChildStatus.brokenBy(cause);
    if (this._props.status.equals(broken)) return Result.fail("unchanged");

    this._props.status = broken;
    return Result.ok();
  }

  requestManualSync(now: Date): Result<void, "throttled"> {
    const last = this._props.lastSyncRequestedAt;
    if (last.isSome() && now.getTime() - last.unwrap().getTime() < MANUAL_SYNC_THROTTLE_MS)
      return Result.fail("throttled");

    this._props.lastSyncRequestedAt = Option.some(now);
    this._props.syncStartedAt = Option.some(now);
    this._props.nextSyncAt = new Date(now.getTime() + SYNC_LEASE_MS);
    return Result.ok();
  }
}

import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { ChildAccountId } from "./child-account-id";
import type { AvatarUrl } from "./value-objects/avatar-url.vo";
import type { ChildColor } from "./value-objects/child-color.vo";
import type { ChildLabel } from "./value-objects/child-label.vo";
import { ChildStatus, type ReconnectCause } from "./value-objects/child-status.vo";
import type { GoogleEmail } from "./value-objects/google-email.vo";

export const MANUAL_SYNC_COOLDOWN_MS = 5 * 60_000;
export const SYNC_LEASE_MS = 10 * 60_000;
export const DISCONNECT_LEASE_MS = 2 * 60_000;

const HOUR_MS = 60 * 60_000;
export const SCHOOL_RETRY_DELAYS_MS = [HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS] as const;

function schoolRetryDelay(retries: number): number {
  return SCHOOL_RETRY_DELAYS_MS[Math.min(retries, SCHOOL_RETRY_DELAYS_MS.length - 1)] ?? HOUR_MS;
}

export interface ChildAccountProps {
  userId: string;
  linkedAccountId: string;
  googleEmail: GoogleEmail;
  label: ChildLabel;
  color: ChildColor;
  avatarUrl: Option<AvatarUrl>;
  showsPhoto: boolean;
  status: ChildStatus;
  connectedAt: Date;
  lastSyncedAt: Option<Date>;
  nextSyncAt: Date;
  syncStartedAt: Option<Date>;
  lastSyncRequestedAt: Option<Date>;
  syncLease: number;
  syncAttempts: number;
}

export type ManualSyncRefusal = "unavailable" | "running" | "throttled";

export interface NewChildAccount {
  userId: string;
  linkedAccountId: string;
  googleEmail: GoogleEmail;
  label: ChildLabel;
  color: ChildColor;
  avatarUrl: Option<AvatarUrl>;
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
        color: input.color,
        avatarUrl: input.avatarUrl,
        showsPhoto: false,
        status: ChildStatus.connected(),
        connectedAt: input.now,
        lastSyncedAt: Option.none(),
        nextSyncAt: input.now,
        syncStartedAt: Option.none(),
        lastSyncRequestedAt: Option.none(),
        syncLease: 0,
        syncAttempts: 0,
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

  recolor(color: ChildColor): void {
    this._props.color = color;
  }

  showAvatar(avatarUrl: Option<AvatarUrl>): void {
    this._props.avatarUrl = avatarUrl;
  }

  choosePhoto(showsPhoto: boolean): Result<void, "no_photo"> {
    if (showsPhoto && this._props.avatarUrl.isNone()) return Result.fail("no_photo");

    this._props.showsPhoto = showsPhoto;
    return Result.ok();
  }

  reconnect(now: Date): Result<void, "disconnecting"> {
    if (this.isDisconnecting()) return Result.fail("disconnecting");

    this._props.status = ChildStatus.connected();
    if (this.isSyncLeased(now)) return Result.ok();

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

  markNeedsReconnect(cause: ReconnectCause, now: Date): Result<void, "unchanged"> {
    const broken = ChildStatus.brokenBy(cause);
    if (this._props.status.equals(broken) || this.isDisconnecting())
      return Result.fail("unchanged");

    this._props.status = broken;
    this._props.syncStartedAt = Option.none();
    if (cause === "school_blocked") this.waitForSchool(now, 0);
    return Result.ok();
  }

  retrySchoolLater(now: Date): Result<void, "not_blocked"> {
    if (!this.isBlockedBySchool()) return Result.fail("not_blocked");

    this._props.syncStartedAt = Option.none();
    this.waitForSchool(now, this._props.syncAttempts);
    return Result.ok();
  }

  restoreAfterSchoolBlock(): Result<void, "not_blocked"> {
    if (!this.isBlockedBySchool()) return Result.fail("not_blocked");

    this._props.status = ChildStatus.connected();
    return Result.ok();
  }

  isBlockedBySchool(): boolean {
    return this._props.status.value === "blocked_by_school";
  }

  private waitForSchool(now: Date, retries: number): void {
    this._props.syncAttempts = retries;
    this._props.nextSyncAt = new Date(now.getTime() + schoolRetryDelay(retries));
  }

  requestManualSync(now: Date): Result<void, ManualSyncRefusal> {
    if (this._props.status.value !== "connected") return Result.fail("unavailable");

    if (this.isSyncLeased(now)) return Result.fail("running");

    if (this.manualSyncCooldownEndsAt(now) > now) return Result.fail("throttled");

    this._props.lastSyncRequestedAt = Option.some(now);
    this._props.syncStartedAt = Option.some(now);
    this._props.nextSyncAt = new Date(now.getTime() + SYNC_LEASE_MS);
    this._props.syncLease += 1;
    return Result.ok();
  }

  manualSyncCooldownEndsAt(now: Date): Date {
    return this._props.lastSyncRequestedAt
      .map((last) => new Date(last.getTime() + MANUAL_SYNC_COOLDOWN_MS))
      .filter((endsAt) => endsAt > now)
      .unwrapOr(now);
  }

  manualSyncAvailableAt(now: Date): Date {
    const cooldownEnd = this.manualSyncCooldownEndsAt(now);
    if (!this.isSyncLeased(now)) return cooldownEnd;

    return new Date(Math.max(this._props.nextSyncAt.getTime(), cooldownEnd.getTime()));
  }

  private isSyncLeased(now: Date): boolean {
    return this._props.syncStartedAt.isSome() && this._props.nextSyncAt > now;
  }
}

import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { AlertId } from "./alert-id";
import { AlertOrigin } from "./value-objects/alert-origin.vo";
import { AlertStatus } from "./value-objects/alert-status.vo";
import { AlertTime } from "./value-objects/alert-time.vo";

export const MISSED_AFTER_MS = 6 * 3_600_000;

export interface AlertProps {
  eventId: string;
  userId: string;
  time: AlertTime;
  deadlineAt: Date;
  origin: AlertOrigin;
  status: AlertStatus;
  sentAt: Option<Date>;
}

export interface AlertDeadline {
  at: Date;
  date: string;
}

export interface NewDefaultAlert {
  eventId: string;
  userId: string;
  deadline: AlertDeadline;
  now: Date;
}

export type UserTimeRefusal = "in_past" | "after_deadline";

export type DispatchVerdict = "wait" | "deliver" | "missed" | "skipped";

export class Alert extends Aggregate<AlertProps, AlertId> {
  private constructor(props: AlertProps, id: AlertId) {
    super(props, id);
  }

  static scheduleDefault(input: NewDefaultAlert): Result<Alert> {
    const time = AlertTime.defaultBefore(input.deadline.date);
    if (time.isFailure) return Result.fail(time.getError());

    const alert = new Alert(
      {
        eventId: input.eventId,
        userId: input.userId,
        time: time.getValue(),
        deadlineAt: input.deadline.at,
        origin: AlertOrigin.byDefault(),
        status: AlertStatus.skipped(),
        sentAt: Option.none(),
      },
      new AlertId(),
    );
    alert.settleStatus(input.now, false);
    return Result.ok(alert);
  }

  static reconstitute(props: AlertProps, id: AlertId): Alert {
    return new Alert(props, id);
  }

  isPending(): boolean {
    return this._props.status.value === "pending";
  }

  isShown(): boolean {
    return this.isPending() || this._props.status.value === "sent";
  }

  follow(deadline: AlertDeadline, now: Date): Result<void> {
    if (this._props.status.value === "sent") return Result.ok();

    const wasPending = this.isPending();
    const previous = this._props.time;
    if (this._props.origin.value === "default") {
      const time = AlertTime.defaultBefore(deadline.date);
      if (time.isFailure) return Result.fail(time.getError());
      this._props.time = time.getValue();
    }
    this._props.deadlineAt = deadline.at;
    this.settleStatus(now, wasPending && previous.equals(this._props.time));
    return Result.ok();
  }

  resetToDefault(deadline: AlertDeadline, now: Date): Result<void> {
    const time = AlertTime.defaultBefore(deadline.date);
    if (time.isFailure) return Result.fail(time.getError());

    this._props.origin = AlertOrigin.byDefault();
    this._props.time = time.getValue();
    this._props.deadlineAt = deadline.at;
    this._props.sentAt = Option.none();
    this.settleStatus(now, false);
    return Result.ok();
  }

  setByUser(time: AlertTime, deadlineAt: Date, now: Date): Result<void, UserTimeRefusal> {
    if (!time.isAfter(now)) return Result.fail("in_past");
    if (time.value.at.getTime() >= deadlineAt.getTime()) return Result.fail("after_deadline");

    this._props.origin = AlertOrigin.user();
    this._props.time = time;
    this._props.deadlineAt = deadlineAt;
    this._props.status = AlertStatus.pending();
    this._props.sentAt = Option.none();
    return Result.ok();
  }

  cancel(): void {
    if (this.isPending()) this._props.status = AlertStatus.skipped();
  }

  verdict(now: Date): DispatchVerdict {
    const due = this._props.time.value.at.getTime();
    if (due > now.getTime()) return "wait";
    if (due < now.getTime() - MISSED_AFTER_MS) return "missed";
    if (this._props.deadlineAt.getTime() < now.getTime()) return "skipped";

    return "deliver";
  }

  markSent(now: Date): void {
    this._props.status = AlertStatus.sent();
    this._props.sentAt = Option.some(now);
  }

  markMissed(): void {
    this._props.status = AlertStatus.missed();
  }

  skip(): void {
    this._props.status = AlertStatus.skipped();
  }

  private settleStatus(now: Date, keepOverdue: boolean): void {
    const time = this._props.time;
    const beforeDeadline = time.value.at.getTime() < this._props.deadlineAt.getTime();
    const ahead = time.isAfter(now) || keepOverdue;
    this._props.status = beforeDeadline && ahead ? AlertStatus.pending() : AlertStatus.skipped();
  }
}

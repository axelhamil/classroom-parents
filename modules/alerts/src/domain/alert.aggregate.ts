import { Aggregate, Option, Result } from "@packages/ddd-kit";
import { utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { AlertId } from "./alert-id";
import { AlertOrigin } from "./value-objects/alert-origin.vo";
import { AlertStatus } from "./value-objects/alert-status.vo";
import { ALERT_TIME_ZONE, AlertTime, daysBetween } from "./value-objects/alert-time.vo";

export const MISSED_AFTER_MS = 6 * 3_600_000;

export interface AlertProps {
  eventId: string;
  userId: string;
  time: AlertTime;
  deadlineAt: Date;
  origin: AlertOrigin;
  status: AlertStatus;
  sentAt: Option<Date>;
  version: number;
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
        version: 1,
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
    if (this._props.status.value === "sent") {
      if (this.deadlineDay() === deadline.date) {
        this._props.deadlineAt = deadline.at;
        return Result.ok();
      }
      if (this._props.origin.value === "user") return this.carryOver(deadline, now);
      return this.resetToDefault(deadline, now);
    }

    const before = this.occurrence();
    if (this._props.origin.value === "default") {
      const time = AlertTime.defaultBefore(deadline.date);
      if (time.isFailure) return Result.fail(time.getError());
      this._props.time = time.getValue();
    }
    this._props.deadlineAt = deadline.at;
    this.settleStatus(now, before.pending && before.time.equals(this._props.time));
    this.renewSince(before);
    return Result.ok();
  }

  resetToDefault(deadline: AlertDeadline, now: Date): Result<void> {
    const time = AlertTime.defaultBefore(deadline.date);
    if (time.isFailure) return Result.fail(time.getError());

    const before = this.occurrence();
    this._props.origin = AlertOrigin.byDefault();
    this._props.time = time.getValue();
    this._props.deadlineAt = deadline.at;
    this._props.sentAt = Option.none();
    this.settleStatus(now, false);
    this.renewSince(before);
    return Result.ok();
  }

  setByUser(time: AlertTime, deadlineAt: Date, now: Date): Result<void, UserTimeRefusal> {
    if (!time.isAfter(now)) return Result.fail("in_past");
    if (time.value.at.getTime() >= deadlineAt.getTime()) return Result.fail("after_deadline");

    const before = this.occurrence();
    this._props.origin = AlertOrigin.user();
    this._props.time = time;
    this._props.deadlineAt = deadlineAt;
    this._props.status = AlertStatus.pending();
    this._props.sentAt = Option.none();
    this.renewSince(before);
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

  private carryOver(deadline: AlertDeadline, now: Date): Result<void> {
    const chosen = this._props.time.value;
    const days = daysBetween(chosen.date, this.deadlineDay());
    if (days.isFailure) return Result.fail(days.getError());
    const time = AlertTime.before(deadline.date, days.getValue(), chosen.time);
    if (time.isFailure) return Result.fail(time.getError());

    const before = this.occurrence();
    this._props.time = time.getValue();
    this._props.deadlineAt = deadline.at;
    this._props.sentAt = Option.none();
    this.settleStatus(now, false);
    this.renewSince(before);
    return Result.ok();
  }

  private occurrence(): { pending: boolean; time: AlertTime } {
    return { pending: this.isPending(), time: this._props.time };
  }

  private renewSince(before: { pending: boolean; time: AlertTime }): void {
    if (!this.isPending()) return;
    if (before.pending && before.time.equals(this._props.time)) return;

    this._props.version += 1;
  }

  private deadlineDay(): string {
    return utcToZonedWall(this._props.deadlineAt, ALERT_TIME_ZONE)
      .map((wall) => wall.date)
      .unwrapOr("");
  }

  private settleStatus(now: Date, keepOverdue: boolean): void {
    const time = this._props.time;
    const beforeDeadline = time.value.at.getTime() < this._props.deadlineAt.getTime();
    const ahead = time.isAfter(now) || keepOverdue;
    this._props.status = beforeDeadline && ahead ? AlertStatus.pending() : AlertStatus.skipped();
  }
}

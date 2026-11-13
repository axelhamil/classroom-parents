import { Aggregate, Option } from "@packages/ddd-kit";
import { AlertId } from "./alert-id";
import type { AlertOrigin } from "./value-objects/alert-origin.vo";
import { AlertStatus } from "./value-objects/alert-status.vo";
import type { AlertTime } from "./value-objects/alert-time.vo";
import type { QuietHours } from "./value-objects/quiet-hours.vo";
import type { Reminder } from "./value-objects/reminder.vo";

export const MISSED_AFTER_MS = 6 * 3_600_000;

export interface AlertProps {
  eventId: string;
  userId: string;
  reminder: Reminder;
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

export interface AlertPlan {
  time: AlertTime;
  origin: AlertOrigin;
}

export interface NewAlert extends AlertPlan {
  eventId: string;
  userId: string;
  reminder: Reminder;
  deadline: AlertDeadline;
  now: Date;
}

export type DispatchVerdict = "wait" | "deliver" | "missed" | "skipped";

interface Occurrence {
  pending: boolean;
  time: AlertTime;
}

export class Alert extends Aggregate<AlertProps, AlertId> {
  private constructor(props: AlertProps, id: AlertId) {
    super(props, id);
  }

  static schedule(input: NewAlert): Alert {
    const alert = new Alert(
      {
        eventId: input.eventId,
        userId: input.userId,
        reminder: input.reminder,
        time: input.time,
        deadlineAt: input.deadline.at,
        origin: input.origin,
        status: AlertStatus.skipped(),
        sentAt: Option.none(),
        version: 1,
      },
      new AlertId(),
    );
    alert.settleStatus(input.now, false);
    return alert;
  }

  static reconstitute(props: AlertProps, id: AlertId): Alert {
    return new Alert(props, id);
  }

  key(): string {
    return this._props.reminder.key();
  }

  isPending(): boolean {
    return this._props.status.value === "pending";
  }

  follow(plan: AlertPlan, deadline: AlertDeadline, quiet: QuietHours, now: Date): void {
    const before = this.occurrence();
    this._props.origin = plan.origin;
    if (this._props.status.value === "sent" && !this.rearms(plan.time, deadline, quiet, now)) {
      this._props.deadlineAt = deadline.at;
      return;
    }

    const rearmed = this._props.status.value === "sent";
    this._props.time = plan.time;
    this._props.deadlineAt = deadline.at;
    if (rearmed) this._props.sentAt = Option.none();
    this.settleStatus(now, !rearmed && before.pending && before.time.equals(plan.time));
    this.renewSince(before);
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

  ringsBefore(deadlineAt: Date): boolean {
    return this._props.time.value.at.getTime() < deadlineAt.getTime();
  }

  markSent(now: Date): void {
    this._props.status = AlertStatus.sent();
    this._props.sentAt = Option.some(now);
  }

  markMissed(): void {
    this._props.status = AlertStatus.missed();
    this._props.sentAt = Option.none();
  }

  skip(): void {
    this._props.status = AlertStatus.skipped();
  }

  private occurrence(): Occurrence {
    return { pending: this.isPending(), time: this._props.time };
  }

  private renewSince(before: Occurrence): void {
    if (!this.isPending()) return;
    if (before.pending && before.time.equals(this._props.time)) return;

    this._props.version += 1;
  }

  private rearms(time: AlertTime, deadline: AlertDeadline, quiet: QuietHours, now: Date): boolean {
    const deadlineMoved = deadline.at.getTime() !== this._props.deadlineAt.getTime();
    const movedAhead = !time.equals(this._props.time) && time.isAfter(now);

    return deadlineMoved && movedAhead && !quiet.silences(time.value.time);
  }

  private settleStatus(now: Date, keepOverdue: boolean): void {
    const time = this._props.time;
    const beforeDeadline = time.value.at.getTime() < this._props.deadlineAt.getTime();
    const ahead = time.isAfter(now) || keepOverdue;
    this._props.status = beforeDeadline && ahead ? AlertStatus.pending() : AlertStatus.skipped();
  }
}

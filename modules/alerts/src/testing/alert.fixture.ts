import { Option } from "@packages/ddd-kit";
import { zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { Alert } from "../domain/alert.aggregate";
import { AlertId } from "../domain/alert-id";
import { AlertOrigin, type AlertOriginValue } from "../domain/value-objects/alert-origin.vo";
import { AlertStatus, type AlertStatusValue } from "../domain/value-objects/alert-status.vo";
import { AlertTime } from "../domain/value-objects/alert-time.vo";

export const PARENT = "parent-1";
export const ALERT_EVENT = "0196a000-0000-7000-8000-0000000000e1";
export const ALERT_ID = "0196a000-0000-7000-8000-0000000000a1";

export function paris(date: string, time: string): Date {
  return zonedWallTimeToUtc(date, time, "Europe/Paris").unwrapOr(new Date(Number.NaN));
}

export interface AlertOverrides {
  id?: string;
  status?: AlertStatusValue;
  origin?: AlertOriginValue;
  date?: string;
  time?: string;
  deadlineAt?: Date;
}

export function existingAlert(overrides: AlertOverrides = {}): Alert {
  const time = AlertTime.fromParisWallTime(
    overrides.date ?? "2026-11-13",
    overrides.time ?? "18:00",
  ).getValue();

  return Alert.reconstitute(
    {
      eventId: ALERT_EVENT,
      userId: PARENT,
      time,
      deadlineAt: overrides.deadlineAt ?? paris("2026-11-15", "23:59"),
      origin: AlertOrigin.create(overrides.origin ?? "default").getValue(),
      status: AlertStatus.create(overrides.status ?? "pending").getValue(),
      sentAt: Option.none(),
    },
    new AlertId(overrides.id ?? ALERT_ID),
  );
}

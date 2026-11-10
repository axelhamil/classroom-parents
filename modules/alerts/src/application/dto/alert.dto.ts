import { z } from "zod";
import type { Alert } from "../../domain/alert.aggregate";
import type { AlertOriginValue } from "../../domain/value-objects/alert-origin.vo";

export interface AlertDto {
  date: string;
  time: string;
  dueAt: string;
  origin: AlertOriginValue;
}

export const alertEventParamSchema = z.object({ eventId: z.uuid() });

export const userAlertBodySchema = z.strictObject({ date: z.string(), time: z.string() });

export type UserAlertTime = z.infer<typeof userAlertBodySchema>;

export function toAlertDto(alert: Alert): AlertDto {
  const time = alert.get("time").value;

  return {
    date: time.date,
    time: time.time,
    dueAt: time.at.toISOString(),
    origin: alert.get("origin").value,
  };
}

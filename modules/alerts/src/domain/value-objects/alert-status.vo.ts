import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const ALERT_STATUSES = ["pending", "sent", "skipped", "missed"] as const;

export type AlertStatusValue = (typeof ALERT_STATUSES)[number];

const alertStatusSchema = z.enum(ALERT_STATUSES);

export class AlertStatus extends ValueObject<AlertStatusValue> {
  static pending(): AlertStatus {
    return new AlertStatus("pending");
  }

  static sent(): AlertStatus {
    return new AlertStatus("sent");
  }

  static skipped(): AlertStatus {
    return new AlertStatus("skipped");
  }

  static missed(): AlertStatus {
    return new AlertStatus("missed");
  }

  protected validate(value: AlertStatusValue): Result<AlertStatusValue> {
    const parsed = alertStatusSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown alert status ${String(value)}`);

    return Result.ok(parsed.data);
  }
}

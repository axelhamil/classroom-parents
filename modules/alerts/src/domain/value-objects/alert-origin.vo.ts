import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const ALERT_ORIGINS = ["default", "user"] as const;

export type AlertOriginValue = (typeof ALERT_ORIGINS)[number];

const alertOriginSchema = z.enum(ALERT_ORIGINS);

export class AlertOrigin extends ValueObject<AlertOriginValue> {
  static byDefault(): AlertOrigin {
    return new AlertOrigin("default");
  }

  static user(): AlertOrigin {
    return new AlertOrigin("user");
  }

  protected validate(value: AlertOriginValue): Result<AlertOriginValue> {
    const parsed = alertOriginSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown alert origin ${String(value)}`);

    return Result.ok(parsed.data);
  }
}

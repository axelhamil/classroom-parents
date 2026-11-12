import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const CHILD_COLORS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type ChildColorValue = (typeof CHILD_COLORS)[number];

export const childColorSchema = z.literal(CHILD_COLORS);

const INVALID_HUE = "a child color is one of the hues 1 to 8";

export class ChildColor extends ValueObject<ChildColorValue> {
  static fromHue(hue: number): Result<ChildColor> {
    const parsed = childColorSchema.safeParse(hue);
    if (!parsed.success) return Result.fail(INVALID_HUE);

    return ChildColor.create(parsed.data);
  }

  static leastUsedAmong(taken: readonly ChildColor[]): ChildColor {
    const uses = (color: ChildColorValue) => taken.filter((used) => used.value === color).length;
    const least = CHILD_COLORS.reduce((best, color) => (uses(color) < uses(best) ? color : best));

    return new ChildColor(least);
  }

  protected validate(value: ChildColorValue): Result<ChildColorValue> {
    const parsed = childColorSchema.safeParse(value);
    if (!parsed.success) return Result.fail(INVALID_HUE);

    return Result.ok(parsed.data);
  }
}

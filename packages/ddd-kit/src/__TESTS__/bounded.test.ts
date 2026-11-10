import { describe, expect, it } from "vitest";
import { mapBounded } from "../index";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("mapBounded", () => {
  it("returns every result in the order of the items", async () => {
    const results = await mapBounded([30, 10, 20], 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms * 2;
    });

    expect(results).toEqual([60, 20, 40]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;

    await mapBounded([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });

    expect(peak).toBe(3);
  });

  it("waits for every lane before rethrowing the first failure", async () => {
    const finished: number[] = [];

    const run = mapBounded([1, 2, 3], 3, async (item) => {
      if (item === 1) throw new Error("lane 1 failed");
      await tick();
      finished.push(item);
    });

    await expect(run).rejects.toThrow("lane 1 failed");
    expect(finished.sort()).toEqual([2, 3]);
  });

  it("returns an empty list for no item", async () => {
    expect(await mapBounded([], 4, async () => 1)).toEqual([]);
  });
});

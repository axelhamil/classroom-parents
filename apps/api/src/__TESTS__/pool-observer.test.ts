import { afterEach, describe, expect, it } from "bun:test";
import {
  closeRateLimitDb,
  type DatabasePool,
  getRateLimitDbClient,
  observeDatabasePools,
} from "@packages/drizzle";

afterEach(() => closeRateLimitDb());

describe("observeDatabasePools", () => {
  it("hands over a pool opened before the platform started observing", () => {
    getRateLimitDbClient();
    const seen: DatabasePool[] = [];

    observeDatabasePools((pool) => seen.push(pool));

    expect(seen).toHaveLength(1);
  });

  it("forgets a closed pool, so a later observer never receives an ended one", async () => {
    getRateLimitDbClient();
    await closeRateLimitDb();
    const seen: DatabasePool[] = [];

    observeDatabasePools((pool) => seen.push(pool));

    expect(seen).toHaveLength(0);
  });
});

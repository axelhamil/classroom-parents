import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { PARIS_TIME_ZONE, utcToZonedWall, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { nextSyncAt } from "../domain/sync-window";

const MINUTE_MS = 60_000;

function paris(date: string, time: string): Date {
  return zonedWallTimeToUtc(date, time, PARIS_TIME_ZONE).getValue();
}

function wall(at: Date): string {
  const { date, time } = utcToZonedWall(at, PARIS_TIME_ZONE).getValue();
  return `${date} ${time}`;
}

const noAlert = { jitterMs: 0, nextAlertAt: Option.none<Date>() };

function after(now: Date, plan: Partial<typeof noAlert> = {}): string {
  return wall(nextSyncAt(now, { ...noAlert, ...plan }));
}

describe("school-day daytime", () => {
  it("given a Monday at 11:00, then the next sync is one hour later", () => {
    expect(after(paris("2026-11-09", "11:00"))).toBe("2026-11-09 12:00");
  });

  it("given 07:00 on a school day, then daytime has started and the next sync is at 08:00", () => {
    expect(after(paris("2026-11-10", "07:00"))).toBe("2026-11-10 08:00");
  });

  it("given 20:59 on a school day, then it is still daytime", () => {
    expect(after(paris("2026-11-12", "20:59"))).toBe("2026-11-12 21:59");
  });

  it("given a jitter, then it is added to the hourly slot", () => {
    const now = paris("2026-11-09", "11:00");

    const next = nextSyncAt(now, { ...noAlert, jitterMs: 90_000 });

    expect(next.getTime() - now.getTime()).toBe(60 * MINUTE_MS + 90_000);
  });
});

describe("night and weekend", () => {
  it("given 21:00 on a school day, then night starts and the next sync is 6 h later", () => {
    expect(after(paris("2026-11-12", "21:00"))).toBe("2026-11-13 03:00");
  });

  it("given 06:59 on a Monday, then the next sync is the 07:00 opening", () => {
    expect(after(paris("2026-11-09", "06:59"))).toBe("2026-11-09 07:00");
  });

  it("given 03:00 on a school day, then 6 h is capped at the 07:00 opening", () => {
    expect(after(paris("2026-11-13", "03:00"))).toBe("2026-11-13 07:00");
  });

  it("given a Saturday noon, then the weekend waits 6 h", () => {
    expect(after(paris("2026-11-14", "12:00"))).toBe("2026-11-14 18:00");
  });

  it("given Friday 21:00, then the chain of night syncs lands on Monday 07:00", () => {
    let at = paris("2026-11-13", "21:00");
    const chain: string[] = [];
    while (at < paris("2026-11-16", "07:00")) {
      at = nextSyncAt(at, noAlert);
      chain.push(wall(at));
    }

    expect(chain).toEqual([
      "2026-11-14 03:00",
      "2026-11-14 09:00",
      "2026-11-14 15:00",
      "2026-11-14 21:00",
      "2026-11-15 03:00",
      "2026-11-15 09:00",
      "2026-11-15 15:00",
      "2026-11-15 21:00",
      "2026-11-16 03:00",
      "2026-11-16 07:00",
    ]);
  });

  it("given a jitter at night, then it never pushes past the 07:00 opening", () => {
    expect(after(paris("2026-11-16", "01:00"), { jitterMs: 3 * MINUTE_MS })).toBe(
      "2026-11-16 07:00",
    );
  });
});

describe("before an alert", () => {
  const now = paris("2026-11-09", "11:00");

  it("given an alert at 11:40, then the child is synced 30 min before it", () => {
    expect(after(now, { nextAlertAt: Option.some(paris("2026-11-09", "11:40")) })).toBe(
      "2026-11-09 11:10",
    );
  });

  it("given an alert whose lead comes after the hourly slot, then the slot wins", () => {
    expect(after(now, { nextAlertAt: Option.some(paris("2026-11-09", "14:00")) })).toBe(
      "2026-11-09 12:00",
    );
  });

  it("given an alert less than 30 min away, then its lead is past and the slot wins", () => {
    expect(after(now, { nextAlertAt: Option.some(paris("2026-11-09", "11:20")) })).toBe(
      "2026-11-09 12:00",
    );
  });

  it("given a jitter that would cross the alert lead, then the lead bounds it", () => {
    const next = nextSyncAt(now, {
      jitterMs: 3 * MINUTE_MS,
      nextAlertAt: Option.some(paris("2026-11-09", "12:31")),
    });

    expect(wall(next)).toBe("2026-11-09 12:01");
  });

  it("given a night alert, then it pulls the sync before the opening", () => {
    expect(
      after(paris("2026-11-14", "01:00"), {
        nextAlertAt: Option.some(paris("2026-11-14", "04:00")),
      }),
    ).toBe("2026-11-14 03:30");
  });
});

describe("daylight saving change days", () => {
  it("given the Saturday night before spring forward, then 6 h are real hours", () => {
    expect(after(paris("2026-03-28", "23:30"))).toBe("2026-03-29 06:30");
  });

  it("given the Monday after spring forward, then the opening is 07:00 summer time", () => {
    const next = nextSyncAt(paris("2026-03-30", "03:00"), noAlert);

    expect(next.toISOString()).toBe("2026-03-30T05:00:00.000Z");
  });

  it("given the night of fall back, then 6 h are real hours", () => {
    expect(after(paris("2026-10-25", "01:30"))).toBe("2026-10-25 06:30");
  });

  it("given the Monday after fall back, then the opening is 07:00 winter time", () => {
    const next = nextSyncAt(paris("2026-10-26", "02:00"), noAlert);

    expect(next.toISOString()).toBe("2026-10-26T06:00:00.000Z");
  });
});

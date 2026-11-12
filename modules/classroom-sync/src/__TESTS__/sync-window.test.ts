import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { PARIS_TIME_ZONE, utcToZonedWall, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import {
  ALERT_LEAD_MS,
  alertLookupFrom,
  nextSyncAt,
  SERVED_MARGIN_MS,
  SYNC_JITTER_MAX_MS,
} from "../domain/sync-window";

const MINUTE_MS = 60_000;

function paris(date: string, time: string): Date {
  return zonedWallTimeToUtc(date, time, PARIS_TIME_ZONE).getValue();
}

function wall(at: Date): string {
  const { date, time } = utcToZonedWall(at, PARIS_TIME_ZONE).getValue();
  return `${date} ${time}`;
}

const JITTERS_MS = [1_000, 45_000, 90_000, 135_000, 179_000];

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

  it("given 06:50 on a Monday, then the next sync is the 07:00 opening", () => {
    expect(after(paris("2026-11-09", "06:50"))).toBe("2026-11-09 07:00");
  });

  it("given a sync within the served margin before the opening, then the opening counts as served and the next sync is an hour after it", () => {
    expect(after(paris("2026-11-09", "06:58"))).toBe("2026-11-09 08:00");
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

  it("given a jitter at night, then it is spent before the 07:00 opening", () => {
    expect(after(paris("2026-11-16", "01:00"), { jitterMs: 3 * MINUTE_MS })).toBe(
      "2026-11-16 06:57",
    );
  });

  it("given children capped at the opening with different jitters, then they spread before 07:00", () => {
    const opening = paris("2026-11-16", "07:00");

    const syncs = JITTERS_MS.map((jitterMs) =>
      nextSyncAt(paris("2026-11-16", "03:00"), { ...noAlert, jitterMs }).getTime(),
    );

    expect(new Set(syncs).size).toBe(JITTERS_MS.length);
    expect(syncs.every((at) => at <= opening.getTime())).toBe(true);
  });

  it("given a sync just before the opening with the widest jitter, then it lands an hour after the opening, never on it", () => {
    const now = paris("2026-11-16", "06:59");

    expect(nextSyncAt(now, { ...noAlert, jitterMs: SYNC_JITTER_MAX_MS })).toEqual(
      new Date(paris("2026-11-16", "08:00").getTime() + SYNC_JITTER_MAX_MS),
    );
  });

  it("given a chain of night syncs from 03:00, then each jitter gives a single sync between 06:55 and 07:05", () => {
    for (const jitterMs of JITTERS_MS) {
      let at = paris("2026-11-16", "03:00");
      const around: Date[] = [];
      while (at < paris("2026-11-16", "09:00")) {
        at = nextSyncAt(at, { ...noAlert, jitterMs });
        if (at >= paris("2026-11-16", "06:55") && at <= paris("2026-11-16", "07:05"))
          around.push(at);
      }

      expect(around).toEqual([new Date(paris("2026-11-16", "07:00").getTime() - jitterMs)]);
    }
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

  it("given an alert lead within the served margin after now, then this sync serves it and the slot wins", () => {
    expect(
      after(paris("2026-11-09", "11:28"), {
        nextAlertAt: Option.some(paris("2026-11-09", "12:00")),
      }),
    ).toBe("2026-11-09 12:28");
  });

  it("given a sync just done for an alert, then the lookup starts past its lead and served margin", () => {
    expect(alertLookupFrom(now).getTime() - now.getTime()).toBe(ALERT_LEAD_MS + SERVED_MARGIN_MS);
  });

  it("given a jitter that would cross the alert lead, then it is spent before the lead", () => {
    const next = nextSyncAt(now, {
      jitterMs: 3 * MINUTE_MS,
      nextAlertAt: Option.some(paris("2026-11-09", "12:31")),
    });

    expect(wall(next)).toBe("2026-11-09 11:58");
  });

  it("given children pulled by the same alert with different jitters, then they spread before the lead", () => {
    const lead = paris("2026-11-09", "11:30");

    const syncs = JITTERS_MS.map((jitterMs) =>
      nextSyncAt(now, {
        jitterMs,
        nextAlertAt: Option.some(paris("2026-11-09", "12:00")),
      }).getTime(),
    );

    expect(new Set(syncs).size).toBe(JITTERS_MS.length);
    expect(syncs.every((at) => at <= lead.getTime())).toBe(true);
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

describe("1000 children around a deadline", () => {
  const CHILDREN = 1000;
  const TICK_MS = MINUTE_MS;

  interface ChildRun {
    ran: Date[];
    planned: Date[];
  }

  function jitterOf(child: number, step: number): number {
    return 1_000 + ((child * 7_919 + step * 104_729) % (SYNC_JITTER_MAX_MS - 1_000));
  }

  function runChild(child: number, from: Date, until: Date, alerts: Date[]): ChildRun {
    const run: ChildRun = { ran: [], planned: [] };
    let due = from;
    for (let tick = from; tick < until; tick = new Date(tick.getTime() + TICK_MS)) {
      if (tick < due) continue;

      const lookup = alertLookupFrom(tick);
      due = nextSyncAt(tick, {
        jitterMs: jitterOf(child, run.ran.length),
        nextAlertAt: Option.fromNullable(alerts.find((alertAt) => alertAt > lookup)),
      });
      run.ran.push(tick);
      run.planned.push(due);
    }
    return run;
  }

  function runAll(from: Date, spreadMs: number, until: Date, alerts: Date[] = []): ChildRun[] {
    return Array.from({ length: CHILDREN }, (_, child) =>
      runChild(
        child,
        new Date(from.getTime() + Math.floor((child * spreadMs) / CHILDREN)),
        until,
        alerts,
      ),
    );
  }

  function around(runs: ChildRun[], bound: Date) {
    const near = (at: Date) => Math.abs(at.getTime() - bound.getTime()) <= SERVED_MARGIN_MS;
    return {
      mostRunsPerChild: Math.max(...runs.map((run) => run.ran.filter(near).length)),
      plannedOnBound: runs
        .flatMap((run) => run.planned)
        .filter((at) => at.getTime() === bound.getTime()).length,
    };
  }

  it("given children spread over the night, then each syncs at most once around the 07:00 opening and none is planned on it", () => {
    const runs = runAll(
      paris("2026-11-16", "00:00"),
      6 * 60 * MINUTE_MS,
      paris("2026-11-16", "08:30"),
    );

    expect(around(runs, paris("2026-11-16", "07:00"))).toEqual({
      mostRunsPerChild: 1,
      plannedOnBound: 0,
    });
  });

  it("given alerts at 18:00 and 18:20, then each child syncs at most once around the 17:30 lead and is still pulled before the 17:50 one", () => {
    const secondLead = paris("2026-11-16", "17:50");
    const runs = runAll(
      paris("2026-11-16", "16:30"),
      60 * MINUTE_MS,
      paris("2026-11-16", "18:00"),
      [paris("2026-11-16", "18:00"), paris("2026-11-16", "18:20")],
    );

    expect(around(runs, paris("2026-11-16", "17:30"))).toEqual({
      mostRunsPerChild: 1,
      plannedOnBound: 0,
    });
    const pulledBeforeSecondLead = runs.filter((run) =>
      run.planned.some(
        (at) => at < secondLead && secondLead.getTime() - at.getTime() <= SYNC_JITTER_MAX_MS,
      ),
    );
    expect(pulledBeforeSecondLead).toHaveLength(CHILDREN);
  });
});

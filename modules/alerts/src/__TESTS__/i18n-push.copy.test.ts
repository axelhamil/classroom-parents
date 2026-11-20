import { describe, expect, it } from "bun:test";
import { deadlineLine } from "@packages/i18n";
import type { AlertContext, AlertDeadline } from "../application/ports/alert-context-reader.port";
import { I18nPushCopy } from "../infrastructure/adapters/i18n-push.copy";

const THURSDAY = "2026-11-19";
const FRIDAY_MORNING: AlertDeadline = { date: "2026-11-20", time: "08:30", today: THURSDAY };

function context(n: number, childLabel = "Léa", deadline = FRIDAY_MORNING): AlertContext {
  return {
    alertId: `alert-${n}`,
    email: "parent@example.com",
    eventTitle: `Devoir ${n}`,
    childLabel,
    deadline,
    eventUrl: `https://app.example.com/events/${n}`,
  };
}

const copy = new I18nPushCopy();
const DETAILS = { details: true };
const DISCREET = { details: false };

describe("I18nPushCopy", () => {
  it("given one alert due tomorrow, then the title is the event and the body names the child and says tomorrow, as the app does", async () => {
    expect(await copy.forAlerts([context(1)], DETAILS)).toEqual({
      title: "Devoir 1",
      body: "Léa, échéance demain, 8 h 30",
    });
  });

  it("given one alert due today, then the body says today inside the sentence", async () => {
    const today = { ...FRIDAY_MORNING, today: FRIDAY_MORNING.date };

    expect((await copy.forAlerts([context(1, "Léa", today)], DETAILS)).body).toBe(
      "Léa, échéance aujourd'hui, 8 h 30",
    );
  });

  it("given one alert further away, then its weekday and date are written in lower case inside the sentence", async () => {
    const monday = { date: "2026-11-23", today: THURSDAY };

    expect((await copy.forAlerts([context(1, "Léa", monday)], DETAILS)).body).toBe(
      "Léa, échéance lundi 23 novembre",
    );
  });

  it("given three alerts of one child, then the title counts them and each line is the app's deadline line without the child", async () => {
    const text = await copy.forAlerts([context(1), context(2), context(3)], DETAILS);

    expect(text.title).toBe("3 échéances pour Léa");
    expect(text.body.split("\n")).toEqual(
      [1, 2, 3].map((n) => deadlineLine({ title: `Devoir ${n}`, when: FRIDAY_MORNING })),
    );
    expect(text.body.split("\n")[0]).toBe("Devoir 1, demain, 8 h 30");
  });

  it("given alerts of two children, then each line is the app's deadline line naming its child", async () => {
    const text = await copy.forAlerts([context(1), context(2, "Hugo")], DETAILS);

    expect(text.title).toBe("2 échéances pour vos enfants");
    expect(text.body.split("\n")).toEqual([
      deadlineLine({ child: "Léa", title: "Devoir 1", when: FRIDAY_MORNING }),
      deadlineLine({ child: "Hugo", title: "Devoir 2", when: FRIDAY_MORNING }),
    ]);
    expect(text.body).toBe("Léa : Devoir 1, demain, 8 h 30\nHugo : Devoir 2, demain, 8 h 30");
  });

  it("given more alerts than a notification shows, then the last line counts the rest", async () => {
    const text = await copy.forAlerts(
      [1, 2, 3, 4, 5, 6].map((n) => context(n)),
      DETAILS,
    );

    expect(text.body.split("\n")).toHaveLength(5);
    expect(text.body.split("\n").at(-1)).toBe("et 2 autres");
  });

  it("given a parent keeping details off the lock screen, then one alert shows the app name and its relative deadline only", async () => {
    expect(await copy.forAlerts([context(1)], DISCREET)).toEqual({
      title: "KeepUpKids",
      body: "1 échéance demain, 8 h 30",
    });
  });

  it("given a parent keeping details off the lock screen, then a group names neither child nor title", async () => {
    const text = await copy.forAlerts([context(1), context(2, "Hugo"), context(3)], DISCREET);

    expect(text).toEqual({
      title: "KeepUpKids",
      body: "3 échéances à venir",
    });
  });
});

describe("I18nPushCopy digest", () => {
  const SUNDAY = "2026-11-15";

  it("given one deadline of one child next Monday, then the summary is singular and the next one reads tomorrow", async () => {
    const summary = {
      total: 1,
      children: [{ label: "Léa", count: 1 }],
      next: { title: "Piscine", date: "2026-11-16" },
      today: SUNDAY,
    };

    expect(await copy.forDigest(summary, DETAILS)).toEqual({
      title: "Votre semaine",
      body: "1 échéance cette semaine pour Léa. Prochaine : Piscine, demain.",
    });
  });

  it("given deadlines of two children, then the summary is plural, counts per child and dates the next one", async () => {
    const summary = {
      total: 5,
      children: [
        { label: "Léa", count: 2 },
        { label: "Hugo", count: 3 },
      ],
      next: { title: "Exposé", date: "2026-11-18" },
      today: SUNDAY,
    };

    expect((await copy.forDigest(summary, DETAILS)).body).toBe(
      "5 échéances cette semaine : 2 pour Léa, 3 pour Hugo. Prochaine : Exposé, mercredi 18 novembre.",
    );
  });

  it("given a digest kept off the lock screen, then it only counts the week's deadlines", async () => {
    const summary = {
      total: 5,
      children: [{ label: "Léa", count: 5 }],
      next: { title: "Exposé", date: "2026-11-18" },
      today: SUNDAY,
    };

    expect(await copy.forDigest(summary, DISCREET)).toEqual({
      title: "Votre semaine",
      body: "5 échéances cette semaine.",
    });
    expect((await copy.forDigest({ ...summary, total: 1 }, DISCREET)).body).toBe(
      "1 échéance cette semaine.",
    );
  });
});

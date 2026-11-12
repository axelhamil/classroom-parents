import { describe, expect, it } from "bun:test";
import type { AlertContext } from "../application/ports/alert-context-reader.port";
import { I18nPushCopy } from "../infrastructure/adapters/i18n-push.copy";

function context(n: number, childLabel = "Léa"): AlertContext {
  return {
    alertId: `alert-${n}`,
    email: "parent@example.com",
    eventTitle: `Devoir ${n}`,
    childLabel,
    deadlineLabel: "lundi 16 novembre, 8 h",
    eventUrl: `https://app.example.com/events/${n}`,
  };
}

const copy = new I18nPushCopy();

describe("I18nPushCopy", () => {
  it("given one alert, then the title is the event and the body names the child and the deadline", async () => {
    expect(await copy.forAlerts([context(1)])).toEqual({
      title: "Devoir 1",
      body: "Léa, échéance lundi 16 novembre, 8 h",
    });
  });

  it("given three alerts of one child, then the title counts them for that child and the body lists each", async () => {
    expect(await copy.forAlerts([context(1), context(2), context(3)])).toEqual({
      title: "3 échéances pour Léa",
      body: [
        "Devoir 1, lundi 16 novembre, 8 h",
        "Devoir 2, lundi 16 novembre, 8 h",
        "Devoir 3, lundi 16 novembre, 8 h",
      ].join("\n"),
    });
  });

  it("given alerts of two children, then each line names its child", async () => {
    const text = await copy.forAlerts([context(1), context(2, "Hugo")]);

    expect(text.title).toBe("2 échéances pour vos enfants");
    expect(text.body).toBe(
      "Léa : Devoir 1, lundi 16 novembre, 8 h\nHugo : Devoir 2, lundi 16 novembre, 8 h",
    );
  });

  it("given more alerts than a notification shows, then the last line counts the rest", async () => {
    const text = await copy.forAlerts([1, 2, 3, 4, 5, 6].map((n) => context(n)));

    expect(text.body.split("\n")).toHaveLength(5);
    expect(text.body.split("\n").at(-1)).toBe("et 2 autres");
  });
});

import { describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import ICAL from "ical.js";
import type { FeedEntry } from "../application/ports/feed-entries.port";
import { foldLine, writeFeedCalendar } from "../application/services/feed-calendar";

const NOW = new Date("2026-11-10T09:00:00.000Z");
const APP_HOST = "app.example.fr";

const allDay: FeedEntry = {
  eventId: "0196a000-0000-7000-8000-0000000000e1",
  childLabel: "Léa",
  title: "Contrôle; chapitre 3, partie \\ B",
  description: "Réviser les fractions\net les décimaux.",
  categoryLabel: "Évaluation",
  deadlineDate: "2026-11-19",
  deadlineTime: Option.none(),
  classroomUrl: Option.some("https://classroom.google.com/c/abc/p/def"),
  alarmsAt: [new Date("2026-11-17T17:00:00.000Z"), new Date("2026-11-18T17:00:00.000Z")],
  doneLabel: Option.none(),
};

const timed: FeedEntry = {
  ...allDay,
  eventId: "0196a000-0000-7000-8000-0000000000e2",
  childLabel: "Tom",
  title: "Sortie au musée",
  description: "",
  categoryLabel: "Sortie scolaire",
  deadlineDate: "2026-07-03",
  deadlineTime: Option.some("08:30:00"),
  alarmsAt: [],
};

function parse(ics: string): ICAL.Component {
  return new ICAL.Component(ICAL.parse(ics));
}

function render(entries: FeedEntry[]): string {
  return writeFeedCalendar({ entries, appHost: APP_HOST, now: NOW });
}

function eventOf(calendar: ICAL.Component, uid: string): ICAL.Component {
  const found = calendar
    .getAllSubcomponents("vevent")
    .find((event) => event.getFirstPropertyValue("uid") === uid);
  if (!found) throw new Error(`no VEVENT ${uid}`);

  return found;
}

function timeOf(component: ICAL.Component, name: string): ICAL.Time {
  const value = component.getFirstPropertyValue(name);
  if (!(value instanceof ICAL.Time)) throw new Error(`${name} is not a time`);

  return value;
}

describe("writeFeedCalendar", () => {
  it("given the parent's deadlines, then a parser reads a named calendar refreshed every hour", () => {
    const calendar = parse(render([allDay, timed]));

    expect(calendar.getFirstPropertyValue("version")).toBe("2.0");
    expect(calendar.getFirstPropertyValue("x-wr-calname")).toBe("Échéances scolaires");
    expect(calendar.getFirstPropertyValue("x-published-ttl")).toBe("PT1H");
    expect(String(calendar.getFirstPropertyValue("refresh-interval"))).toBe("PT1H");
    expect(calendar.getAllSubcomponents("vevent")).toHaveLength(2);
  });

  it("given a deadline without a time, then it is an all-day event whose text survives escaping", () => {
    const event = eventOf(parse(render([allDay])), `${allDay.eventId}@${APP_HOST}`);
    const start = timeOf(event, "dtstart");

    expect(start.isDate).toBe(true);
    expect(start.toString()).toBe("2026-11-19");
    expect(event.getFirstPropertyValue("summary")).toBe("Léa · Contrôle; chapitre 3, partie \\ B");
    expect(event.getFirstPropertyValue("description")).toBe(
      "Réviser les fractions\net les décimaux.\n\nClassroom : https://classroom.google.com/c/abc/p/def",
    );
    expect(event.getFirstPropertyValue("categories")).toBe("Évaluation");
  });

  it("given an event the parent added by hand, then it carries no Classroom link", () => {
    const manual = { ...allDay, classroomUrl: Option.none<string>() };
    const event = eventOf(parse(render([manual])), `${allDay.eventId}@${APP_HOST}`);

    expect(event.getFirstPropertyValue("url")).toBeNull();
    expect(event.getFirstPropertyValue("description")).toBe(
      "Réviser les fractions\net les décimaux.",
    );
  });

  it("given a deadline at 08:30 in July, then it starts at 06:30 UTC through the Paris time zone it ships", () => {
    const calendar = parse(render([timed]));
    const event = eventOf(calendar, `${timed.eventId}@${APP_HOST}`);
    const zone = new ICAL.Timezone(calendar.getFirstSubcomponent("vtimezone") ?? undefined);
    const start = timeOf(event, "dtstart");
    start.zone = zone;

    expect(event.getFirstProperty("dtstart")?.getParameter("tzid")).toBe("Europe/Paris");
    expect(start.toJSDate().toISOString()).toBe("2026-07-03T06:30:00.000Z");
    expect(event.getFirstPropertyValue("description")).toBe(
      "Classroom : https://classroom.google.com/c/abc/p/def",
    );
  });

  it("given two planned reminders, then the event carries one alarm at each reminder time", () => {
    const event = eventOf(parse(render([allDay])), `${allDay.eventId}@${APP_HOST}`);
    const triggers = event
      .getAllSubcomponents("valarm")
      .map((alarm) => timeOf(alarm, "trigger").toString());

    expect(triggers).toEqual(["2026-11-17T17:00:00Z", "2026-11-18T17:00:00Z"]);
  });

  it("given a deadline marked done, then its summary says so and it rings no alarm", () => {
    const done = { ...allDay, doneLabel: Option.some("Fait") };
    const event = eventOf(parse(render([done])), `${allDay.eventId}@${APP_HOST}`);

    expect(event.getFirstPropertyValue("summary")).toBe(
      "Fait · Léa · Contrôle; chapitre 3, partie \\ B",
    );
    expect(event.getAllSubcomponents("valarm")).toEqual([]);
  });

  it("given a long accented title, then no line exceeds 75 octets nor splits a character, and unfolding restores it", () => {
    const longTitle = `${"Évaluation très importante à préparer ".repeat(6)}🎒`;
    const ics = render([{ ...allDay, title: longTitle }]);
    const lines = ics.split("\r\n");

    expect(lines.every((line) => Buffer.byteLength(line, "utf8") <= 75)).toBe(true);
    expect(lines.every((line) => !line.includes("�"))).toBe(true);
    expect(
      eventOf(parse(ics), `${allDay.eventId}@${APP_HOST}`).getFirstPropertyValue("summary"),
    ).toBe(`Léa · ${longTitle}`);
  });
});

describe("foldLine", () => {
  it("given a line of 80 ASCII octets, then the continuation starts with one space", () => {
    const folded = foldLine("X".repeat(80));

    expect(folded).toBe(`${"X".repeat(75)}\r\n ${"X".repeat(5)}`);
  });
});

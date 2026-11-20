import { describe, expect, it } from "bun:test";
import { readIcsPeriods } from "../domain/calendar/ics-periods";

function calendar(...events: string[][]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events.flatMap((lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"]),
    "END:VCALENDAR",
  ].join("\r\n");
}

function periodsOf(text: string) {
  return readIcsPeriods(text)
    .getValue()
    .periods.map(({ value }) => value);
}

describe("reading the holiday periods of an iCalendar file", () => {
  it("given an all-day event, then its exclusive end becomes the last day off", () => {
    expect(
      periodsOf(
        calendar(["DTSTART;VALUE=DATE:20261219", "DTEND;VALUE=DATE:20270104", "SUMMARY:Noël"]),
      ),
    ).toEqual([{ name: "Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" }]);
  });

  it("given a one-day event without end or with a duration, then the days are counted from its start", () => {
    expect(
      periodsOf(
        calendar(
          ["DTSTART;VALUE=DATE:20270507", "SUMMARY:Pont"],
          ["DTSTART;VALUE=DATE:20270215", "DURATION:P1W", "SUMMARY:Ski week"],
        ),
      ),
    ).toEqual([
      { name: "Ski week", startsOn: "2027-02-15", endsOn: "2027-02-21" },
      { name: "Pont", startsOn: "2027-05-07", endsOn: "2027-05-07" },
    ]);
  });

  it("given folded lines, escapes and control characters in a name, then the name is read clean", () => {
    const text = calendar([
      "DTSTART;VALUE=DATE:20261019",
      "DTEND;VALUE=DATE:20261102",
      "SUMMARY:Vacances de la Toussaint\\, zone\u0007 B\\nécole",
      " primaire",
    ]);

    expect(periodsOf(text)[0]?.name).toBe("Vacances de la Toussaint, zone B écoleprimaire");
  });

  it("given a meeting, a cancelled event and an alarm, then only the holiday is kept", () => {
    const result = readIcsPeriods(
      calendar(
        ["DTSTART:20261205T180000Z", "DTEND:20261205T190000Z", "SUMMARY:Parents meeting"],
        ["DTSTART;VALUE=DATE:20261224", "STATUS:CANCELLED", "SUMMARY:Cancelled"],
        [
          "DTSTART;VALUE=DATE:20270222",
          "DTEND;VALUE=DATE:20270301",
          "BEGIN:VALARM",
          "SUMMARY:Reminder",
          "END:VALARM",
          "SUMMARY:Winter break",
        ],
      ),
    );

    expect(result.getValue().periods.map(({ value }) => value.name)).toEqual(["Winter break"]);
    expect(result.getValue().skipped).toBe(2);
  });

  it.each([
    ["a web page", "<html>BEGIN:VCALENDAR</html>"],
    [
      "a calendar without any all-day event",
      calendar(["DTSTART:20261205T180000Z", "SUMMARY:Meeting"]),
    ],
    ["a file too large", `BEGIN:VCALENDAR\r\n${"X".repeat(600_000)}`],
  ])("given %s, then it is refused", (_, text) => {
    expect(readIcsPeriods(text).isFailure).toBe(true);
  });
});

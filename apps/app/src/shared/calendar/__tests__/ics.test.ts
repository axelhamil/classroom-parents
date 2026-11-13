import { describe, expect, it } from "vitest";
import { deadlineIcs } from "../ics";

const STAMP = new Date("2026-11-12T09:00:00.000Z");

function unfold(ics: string): string {
  return ics.replaceAll("\r\n ", "");
}

describe("deadline .ics export", () => {
  it("ics export folds and escapes", () => {
    const description = `Apporter : maillot, bonnet; serviette\\gel douche.\nRendez-vous à l'entrée du gymnase Édouard-Hérriot à 8 h 15, élèves accompagnés.`;
    const ics = deadlineIcs(
      {
        id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90",
        title: "Piscine, Léa; groupe 2",
        description,
        deadlineDate: "2026-11-19",
        deadlineTime: undefined,
        deadlineAt: "2026-11-19T22:59:00.000Z",
      },
      STAMP,
    );
    const lines = ics.split("\r\n");
    const encoder = new TextEncoder();

    expect(ics.endsWith("\r\n")).toBe(true);
    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true);
    expect(lines.some((line) => line.startsWith(" "))).toBe(true);
    expect(unfold(ics)).toContain("SUMMARY:Piscine\\, Léa\\; groupe 2\r\n");
    expect(unfold(ics)).toContain(
      "DESCRIPTION:Apporter : maillot\\, bonnet\\; serviette\\\\gel douche.\\nRendez-vous",
    );
    expect(unfold(ics)).toContain("DTSTART;VALUE=DATE:20261119\r\n");
    expect(unfold(ics)).toContain("DTEND;VALUE=DATE:20261120\r\n");
    expect(ics).not.toContain("�");
  });

  it("a timed deadline starts at its instant in UTC", () => {
    const ics = deadlineIcs(
      {
        id: "0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90",
        title: "Contrôle",
        description: "",
        deadlineDate: "2026-11-19",
        deadlineTime: "08:30",
        deadlineAt: "2026-11-19T07:30:00.000Z",
      },
      STAMP,
    );

    expect(ics).toContain("DTSTART:20261119T073000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261112T090000Z\r\n");
    expect(ics).toContain("UID:0f6b6a2c-3c1d-4f0e-9a43-5d2b1c7e8f90@");
  });
});

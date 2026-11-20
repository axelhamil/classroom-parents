import { describe, expect, it } from "bun:test";
import { writtenDates } from "../application/services/written-dates";

describe("the dates an announcement writes out", () => {
  it.each([
    ["Arabic", "الامتحان يوم 26 نونبر"],
    ["Portuguese", "Prova dia 26 de novembro"],
    ["Spanish", "Examen el 26 de noviembre"],
    ["English", "Test on November 26"],
    ["French", "Contrôle le 26 novembre"],
    ["English abbreviated", "Test on Nov. 26th"],
  ])("given an announcement in %s for 26 November, then 26 November is read", (_language, text) => {
    expect(writtenDates(text)).toEqual([{ day: 26, month: 11 }]);
  });

  it("given a written year, then it is kept", () => {
    expect(writtenDates("Prova dia 26 de novembro de 2026")).toEqual([
      { day: 26, month: 11, year: 2026 },
    ]);
  });

  it("given a numeric date, then only its calendar readings are kept", () => {
    expect(writtenDates("À rendre le 26/11")).toEqual([{ day: 26, month: 11 }]);
    expect(writtenDates("Due 11/26")).toEqual([{ day: 26, month: 11 }]);
    expect(writtenDates("Due 11/12")).toEqual([
      { day: 11, month: 12 },
      { day: 12, month: 11 },
    ]);
  });

  it("given a short month name not followed by a dot, then an ordinary phrase is not taken for a date", () => {
    expect(writtenDates("set 2 tables")).toEqual([]);
  });

  it("given a day out of the calendar, then nothing is read", () => {
    expect(writtenDates("Salle 45/13")).toEqual([]);
  });
});

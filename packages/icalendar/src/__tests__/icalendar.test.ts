import { describe, expect, it } from "vitest";
import { eventIdentity, foldLine } from "../icalendar";

describe("foldLine", () => {
  it("given a line of 80 ASCII octets, then the continuation starts with one space", () => {
    const folded = foldLine("X".repeat(80));

    expect(folded).toBe(`${"X".repeat(75)}\r\n ${"X".repeat(5)}`);
  });

  it("given accented text across the limit, then no character is split between two lines", () => {
    const encoder = new TextEncoder();
    const lines = foldLine(`SUMMARY:${"é".repeat(60)}`).split("\r\n");

    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true);
    expect(lines.join("").replace(/^ /gm, "")).not.toContain("�");
    expect(lines.map((line, index) => (index === 0 ? line : line.slice(1))).join("")).toBe(
      `SUMMARY:${"é".repeat(60)}`,
    );
  });
});

describe("eventIdentity", () => {
  it("given a deadline id, then its UID is pinned and carries no host, so a subscriber never gets a duplicate", () => {
    expect(eventIdentity("0196a000-0000-7000-8000-0000000000e1")).toBe(
      "0196a000-0000-7000-8000-0000000000e1@keepupkids",
    );
  });
});

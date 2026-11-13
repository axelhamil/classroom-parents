import { describe, expect, it } from "bun:test";
import { redactSecretPath } from "../secret-path";

const SECRET = "IuIDyPzTPmS4iKn0k1vn0VzaM1Mvedi9TR28kxaxrNo";

describe("redactSecretPath", () => {
  it.each([
    ["a request path", `/calendar/${SECRET}.ics`, "/calendar/[secret]"],
    ["a transaction name", `GET /calendar/${SECRET}.ics`, "GET /calendar/[secret]"],
    [
      "a full url with a query",
      `https://api.example.fr/calendar/${SECRET}.ics?x=1`,
      "https://api.example.fr/calendar/[secret]?x=1",
    ],
  ])(
    "given %s carrying a feed secret, then the secret never reaches a log",
    (_label, text, expected) => {
      expect(redactSecretPath(text)).toBe(expected);
    },
  );

  it("given the authenticated feed settings path, then it is left readable", () => {
    expect(redactSecretPath("/calendar-feed")).toBe("/calendar-feed");
  });
});

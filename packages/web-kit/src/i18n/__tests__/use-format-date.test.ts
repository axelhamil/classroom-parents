import { describe, expect, it } from "vitest";
import { formatDateTime } from "../use-format-date";

const AT = "2030-01-15T12:00:00.000Z";

describe("formatDateTime", () => {
  it("writes the date short by default", () => {
    expect(formatDateTime(AT, "fr")).toMatch(/^15\/01\/2030/);
  });

  it("writes the month in words when the caller asks the medium style", () => {
    expect(formatDateTime(AT, "fr", "medium")).toMatch(/^15 janv\. 2030/);
  });
});

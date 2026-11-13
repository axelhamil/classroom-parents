import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");

describe("the app shell", () => {
  it("leaves link previews to the public site, which builds them from absolute URLs", () => {
    expect(html).not.toMatch(/property="og:/);
    expect(html).not.toMatch(/name="twitter:/);
  });
});

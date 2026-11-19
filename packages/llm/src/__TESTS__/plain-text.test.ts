import { describe, expect, it } from "bun:test";
import { withoutLinks } from "../contract/plain-text";

describe("withoutLinks", () => {
  it("keeps the label of a Markdown link and drops its target", () => {
    expect(withoutLinks("Remplir [le formulaire](http://evil.example/x?a=1) avant lundi")).toBe(
      "Remplir le formulaire avant lundi",
    );
  });

  it("drops bare, scheme-less and script addresses", () => {
    expect(
      withoutLinks("Voir https://evil.example/p, www.evil.example et javascript:alert(1) ici"),
    ).toBe("Voir et (1) ici");
  });

  it("leaves markup as literal text, which the screen renders as a text node", () => {
    expect(withoutLinks('<img src=x onerror="alert(1)">')).toBe('<img src=x onerror="alert(1)">');
  });
});

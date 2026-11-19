// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BrandFavicon } from "../brand-favicon";

describe("brand favicon", () => {
  afterEach(() => {
    document.head.replaceChildren();
    document.documentElement.removeAttribute("data-palette");
  });

  it("repaints the tab icon with the action colour of the palette on screen", async () => {
    const tokens = document.createElement("style");
    tokens.textContent =
      ':root { --primary: #0a0a01; } [data-palette="ink"] { --primary: #0b0b02; }';
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.type = "image/svg+xml";
    document.head.append(tokens, icon);

    render(<BrandFavicon />);
    expect(icon.getAttribute("href")).toContain(encodeURIComponent("#0a0a01"));

    document.documentElement.setAttribute("data-palette", "ink");

    await waitFor(() => expect(icon.getAttribute("href")).toContain(encodeURIComponent("#0b0b02")));
  });
});

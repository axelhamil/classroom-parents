// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardPanel } from "../dashboard";

afterEach(cleanup);

describe("DashboardPanel tone", () => {
  it.each([
    { tone: "hero" as const, marked: true },
    { tone: "default" as const, marked: false },
    { tone: undefined, marked: false },
  ])("given the $tone tone, then the panel is marked as the hero: $marked", ({ tone, marked }) => {
    const { container } = render(<DashboardPanel tone={tone} aria-label="Pour aujourd'hui" />);

    expect(container.querySelectorAll("[data-hero]")).toHaveLength(marked ? 1 : 0);
  });
});

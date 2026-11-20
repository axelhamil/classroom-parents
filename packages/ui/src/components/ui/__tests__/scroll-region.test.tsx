// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollRegion } from "../scroll-region";

function tile(inert = false) {
  return (
    <section aria-labelledby="tile-title">
      <h2 id="tile-title">Agenda</h2>
      <ScrollRegion variant="tile" aria-labelledby="tile-title" inert={inert}>
        <p>Lundi</p>
      </ScrollRegion>
    </section>
  );
}

function renderTile() {
  return render(tile());
}

function tileRegion() {
  return screen.getByRole("group", { name: "Agenda" });
}

class FakeIntersectionObserver {
  static last: FakeIntersectionObserver | undefined;
  readonly targets: Element[] = [];

  constructor(
    readonly report: (
      entries: Pick<IntersectionObserverEntry, "target" | "isIntersecting">[],
    ) => void,
  ) {
    FakeIntersectionObserver.last = this;
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  disconnect() {}

  intersect(edge: string, isIntersecting: boolean) {
    const target = this.targets.find((element) => element.getAttribute("data-fade-edge") === edge);
    if (!target) throw new Error(`no ${edge} sentinel observed`);

    act(() => this.report([{ target, isIntersecting }]));
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ScrollRegion tile", () => {
  it("is a keyboard-reachable group named by the tile title", () => {
    renderTile();

    expect(tileRegion().tabIndex).toBe(0);
  });

  describe("while scrolling", () => {
    it("flags the region on scroll and clears the flag after 800 ms where scrollend is missing", () => {
      const scrollEnd = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onscrollend");
      Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
      vi.useFakeTimers();
      renderTile();

      fireEvent.scroll(tileRegion());
      expect(tileRegion().hasAttribute("data-scrolling")).toBe(true);

      act(() => vi.advanceTimersByTime(799));
      expect(tileRegion().hasAttribute("data-scrolling")).toBe(true);

      act(() => vi.advanceTimersByTime(1));
      expect(tileRegion().hasAttribute("data-scrolling")).toBe(false);

      if (scrollEnd) Object.defineProperty(HTMLElement.prototype, "onscrollend", scrollEnd);
    });

    it("clears the flag on scrollend where the browser fires it", () => {
      vi.useFakeTimers();
      renderTile();

      fireEvent.scroll(tileRegion());
      act(() => vi.advanceTimersByTime(5000));
      expect(tileRegion().hasAttribute("data-scrolling")).toBe(true);

      fireEvent(tileRegion(), new Event("scrollend"));
      expect(tileRegion().hasAttribute("data-scrolling")).toBe(false);
    });
  });

  describe("without scroll-driven animations", () => {
    beforeEach(() => {
      vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
      vi.stubGlobal("CSS", { supports: () => false });
    });

    it("fades only the edges whose sentinel has left the region", () => {
      renderTile();
      const observer = FakeIntersectionObserver.last;

      observer?.intersect("top", true);
      observer?.intersect("bottom", false);
      expect(tileRegion().style.getPropertyValue("--scroll-fade-top")).toBe("0px");
      expect(tileRegion().style.getPropertyValue("--scroll-fade-bottom")).toBe(
        "var(--scroll-fade-size)",
      );

      observer?.intersect("top", false);
      observer?.intersect("bottom", true);
      expect(tileRegion().style.getPropertyValue("--scroll-fade-top")).toBe(
        "var(--scroll-fade-size)",
      );
      expect(tileRegion().style.getPropertyValue("--scroll-fade-bottom")).toBe("0px");
    });

    it("keeps the sentinels out of the accessibility tree", () => {
      renderTile();

      const sentinels = tileRegion().querySelectorAll("[data-fade-edge]");
      expect([...sentinels].map((sentinel) => sentinel.getAttribute("aria-hidden"))).toEqual([
        "true",
        "true",
      ]);
    });
  });

  it("renders no sentinel where scroll-driven animations run", () => {
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    vi.stubGlobal("CSS", { supports: () => true });
    renderTile();

    expect(tileRegion().querySelector("[data-fade-edge]")).toBeNull();
  });

  it("gives the scroll position back when edit mode ends", () => {
    const { rerender } = renderTile();
    const region = tileRegion();
    Object.defineProperty(region, "scrollTop", { value: 120, writable: true });

    rerender(tile(true));
    region.scrollTop = 0;
    rerender(tile(false));

    expect(region.scrollTop).toBe(120);
  });
});

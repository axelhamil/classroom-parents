// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWindowEdgeScroll } from "../window-edge-scroll";

const VIEWPORT = 800;

const BAND = 50;

const MAX_STEP = 20;

let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let scrollY = 0;
let reducedMotion = false;

function runFrames(count: number): void {
  for (let run = 0; run < count; run++) {
    const pending = [...frames.values()];
    frames = new Map();
    for (const callback of pending) callback(run * 16);
  }
}

function scrolledBy(action: () => void): number {
  const before = scrollY;
  action();

  return scrollY - before;
}

beforeEach(() => {
  frames = new Map();
  scrollY = 0;
  reducedMotion = false;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextFrame++;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("innerHeight", VIEWPORT);
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  vi.spyOn(window, "scrollBy").mockImplementation((_x?: unknown, y?: unknown) => {
    scrollY = Math.max(0, scrollY + (typeof y === "number" ? y : 0));
  });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reducedMotion, media: query }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const scroller = () => createWindowEdgeScroll({ band: BAND, maxStep: MAX_STEP });

describe("createWindowEdgeScroll", () => {
  it("given a finger held at the bottom edge, when frames pass without a new move, then the page keeps scrolling", () => {
    const edge = scroller();
    edge.feed(100, VIEWPORT - 1);

    expect(scrolledBy(() => runFrames(10))).toBe(10 * MAX_STEP);
  });

  it("given a finger near the top edge, when frames pass, then the page scrolls up", () => {
    scrollY = 500;
    const edge = scroller();
    edge.feed(100, 1);

    expect(scrolledBy(() => runFrames(2))).toBe(-2 * MAX_STEP);
  });

  it("given a finger going deeper into the band, when a frame passes, then the speed grows", () => {
    const edge = scroller();

    edge.feed(100, VIEWPORT - BAND + 10);
    const shallow = scrolledBy(() => runFrames(1));
    edge.feed(100, VIEWPORT - BAND + 40);
    const deep = scrolledBy(() => runFrames(1));

    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeLessThanOrEqual(MAX_STEP);
  });

  it("given a pointer at the band's inner edge, when a frame passes, then nothing scrolls", () => {
    const edge = scroller();
    edge.feed(100, VIEWPORT - BAND);

    expect(scrolledBy(() => runFrames(3))).toBe(0);
  });

  it("given a scrolling finger, when it is released, then the scrolling stops", () => {
    const edge = scroller();
    edge.feed(100, VIEWPORT - 1);
    runFrames(2);

    edge.stop();

    expect(scrolledBy(() => runFrames(5))).toBe(0);
    expect(edge.lastPointer()).toBeNull();
  });

  it("given a scrolling finger, when it leaves the band, then the scrolling stops", () => {
    const edge = scroller();
    edge.feed(100, VIEWPORT - 1);
    runFrames(2);

    edge.feed(100, VIEWPORT / 2);

    expect(scrolledBy(() => runFrames(5))).toBe(0);
    expect(frames.size).toBe(0);
  });

  it("given the page scrolls under a held finger, when a frame passes, then the last pointer is handed back", () => {
    const onScroll = vi.fn();
    const edge = createWindowEdgeScroll({ band: BAND, maxStep: MAX_STEP, onScroll });
    edge.feed(120, VIEWPORT - 1);

    runFrames(3);

    expect(onScroll).toHaveBeenCalledTimes(3);
    expect(onScroll).toHaveBeenLastCalledWith({ clientX: 120, clientY: VIEWPORT - 1 });
    expect(edge.lastPointer()).toEqual({ clientX: 120, clientY: VIEWPORT - 1 });
  });

  it("given reduced motion, when a finger is held at the edge, then only each move scrolls one step", () => {
    reducedMotion = true;
    const edge = scroller();

    const fed = scrolledBy(() => edge.feed(100, VIEWPORT - 1));
    const held = scrolledBy(() => runFrames(10));
    const fedAgain = scrolledBy(() => edge.feed(100, VIEWPORT - 1));

    expect(fed).toBe(MAX_STEP);
    expect(held).toBe(0);
    expect(frames.size).toBe(0);
    expect(fedAgain).toBe(MAX_STEP);
  });
});

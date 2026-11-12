import { afterEach, describe, expect, it, vi } from "vitest";
import { type RevealOrigin, transitionTheme } from "../theme-transition";

interface BrowserOptions {
  reducedMotion: boolean;
  viewTransitions: boolean;
}

function givenBrowser({ reducedMotion, viewTransitions }: BrowserOptions) {
  const classes = new Set<string>();
  const properties = new Map<string, string>();
  const seenDuringUpdate: string[] = [];

  const root = {
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
    },
  };

  const finishers: Array<() => void> = [];
  const startViewTransition = vi.fn((update: () => void) => {
    seenDuringUpdate.push(...classes);
    update();
    return { finished: new Promise<void>((resolve) => finishers.push(resolve)) };
  });
  const finishAll = () => {
    for (const finish of finishers.splice(0)) finish();
  };

  vi.stubGlobal("window", {
    innerWidth: 400,
    innerHeight: 800,
    matchMedia: () => ({ matches: reducedMotion }),
  });
  vi.stubGlobal("document", {
    documentElement: root,
    body: { getAnimations: () => [{ finished: Promise.resolve() }] },
    ...(viewTransitions ? { startViewTransition } : {}),
  });

  return { classes, properties, startViewTransition, seenDuringUpdate, finishers, finishAll };
}

const origin: RevealOrigin = {
  getBoundingClientRect: () => ({ left: 350, top: 10, width: 40, height: 40 }),
};

describe("theme transition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("swaps at once under reduced motion, without a view transition", async () => {
    const browser = givenBrowser({ reducedMotion: true, viewTransitions: true });
    const apply = vi.fn();

    await transitionTheme(origin, apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(browser.startViewTransition).not.toHaveBeenCalled();
    expect(browser.classes.size).toBe(0);
  });

  it("reveals the new theme from the center of the control that asked for it", async () => {
    const browser = givenBrowser({ reducedMotion: false, viewTransitions: true });
    const apply = vi.fn();

    const done = transitionTheme(origin, apply);

    expect(browser.properties.get("--theme-reveal-x")).toBe("370px");
    expect(browser.properties.get("--theme-reveal-y")).toBe("30px");
    expect(browser.properties.get("--theme-reveal-radius")).toBe(`${Math.hypot(370, 770)}px`);
    browser.finishAll();
    await done;

    expect(apply).toHaveBeenCalledOnce();
    expect(browser.seenDuringUpdate).toEqual(["theme-transitioning"]);
    expect(browser.classes.size).toBe(0);
    expect(browser.properties.size).toBe(0);
  });

  it("cross-fades the page colors when view transitions are missing", async () => {
    const browser = givenBrowser({ reducedMotion: false, viewTransitions: false });
    const apply = vi.fn(() => expect(browser.classes.has("theme-fading")).toBe(true));

    await transitionTheme(origin, apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(browser.classes.size).toBe(0);
  });

  it("keeps the second reveal running when a quick second switch interrupts the first", async () => {
    const browser = givenBrowser({ reducedMotion: false, viewTransitions: true });

    const first = transitionTheme(origin, vi.fn());
    const second = transitionTheme(null, vi.fn());
    browser.finishers[0]?.();
    await first;

    expect(browser.classes.has("theme-transitioning")).toBe(true);
    expect(browser.properties.get("--theme-reveal-x")).toBe("200px");

    browser.finishAll();
    await second;
    expect(browser.classes.size).toBe(0);
  });
});

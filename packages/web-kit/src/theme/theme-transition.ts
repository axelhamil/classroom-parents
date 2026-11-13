const TRANSITIONING_CLASS = "theme-transitioning";
const VEIL_IN_CLASS = "theme-veil-in";
const VEIL_OUT_CLASS = "theme-veil-out";
const VEIL_COLOR = "--theme-veil";
const REVEAL_X = "--theme-reveal-x";
const REVEAL_Y = "--theme-reveal-y";
const REVEAL_RADIUS = "--theme-reveal-radius";

let latestTransition = 0;

export interface RevealOrigin {
  getBoundingClientRect: () => Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;
}

function revealCenter(origin: RevealOrigin | null) {
  if (!origin) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  const rect = origin.getBoundingClientRect();

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function revealTheme(root: HTMLElement, origin: RevealOrigin | null, apply: () => void) {
  const reveal = ++latestTransition;
  const { x, y } = revealCenter(origin);
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  root.style.setProperty(REVEAL_X, `${x}px`);
  root.style.setProperty(REVEAL_Y, `${y}px`);
  root.style.setProperty(REVEAL_RADIUS, `${radius}px`);
  root.classList.add(TRANSITIONING_CLASS);

  try {
    await document.startViewTransition(apply).finished;
  } finally {
    if (reveal === latestTransition) {
      root.classList.remove(TRANSITIONING_CLASS);
      for (const property of [REVEAL_X, REVEAL_Y, REVEAL_RADIUS])
        root.style.removeProperty(property);
    }
  }
}

function veilFinished(name: string) {
  const running = document
    .getAnimations()
    .filter((animation) => animation instanceof CSSAnimation && animation.animationName === name);

  return Promise.allSettled(running.map((animation) => animation.finished));
}

async function veilTheme(root: HTMLElement, apply: () => void) {
  const veil = ++latestTransition;

  root.style.setProperty(VEIL_COLOR, getComputedStyle(root).getPropertyValue("--background"));
  root.classList.add(VEIL_IN_CLASS);

  try {
    await veilFinished("theme-veil-in");
    apply();
    root.classList.replace(VEIL_IN_CLASS, VEIL_OUT_CLASS);
    await veilFinished("theme-veil-out");
  } finally {
    if (veil === latestTransition) {
      root.classList.remove(VEIL_IN_CLASS, VEIL_OUT_CLASS);
      root.style.removeProperty(VEIL_COLOR);
    }
  }
}

export function transitionTheme(origin: RevealOrigin | null, apply: () => void): Promise<void> {
  const root = document.documentElement;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return Promise.resolve();
  }

  if (typeof document.startViewTransition !== "function") return veilTheme(root, apply);

  return revealTheme(root, origin, apply);
}

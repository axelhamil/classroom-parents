const TRANSITIONING_CLASS = "theme-transitioning";
const FADING_CLASS = "theme-fading";
const REVEAL_X = "--theme-reveal-x";
const REVEAL_Y = "--theme-reveal-y";
const REVEAL_RADIUS = "--theme-reveal-radius";

let latestReveal = 0;

export interface RevealOrigin {
  getBoundingClientRect: () => Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;
}

function revealCenter(origin: RevealOrigin | null) {
  if (!origin) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  const rect = origin.getBoundingClientRect();

  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function revealTheme(root: HTMLElement, origin: RevealOrigin | null, apply: () => void) {
  const reveal = ++latestReveal;
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
    if (reveal === latestReveal) {
      root.classList.remove(TRANSITIONING_CLASS);
      for (const property of [REVEAL_X, REVEAL_Y, REVEAL_RADIUS])
        root.style.removeProperty(property);
    }
  }
}

async function fadeTheme(root: HTMLElement, apply: () => void) {
  root.classList.add(FADING_CLASS);
  apply();

  try {
    await Promise.allSettled(document.body.getAnimations().map((animation) => animation.finished));
  } finally {
    root.classList.remove(FADING_CLASS);
  }
}

export function transitionTheme(origin: RevealOrigin | null, apply: () => void): Promise<void> {
  const root = document.documentElement;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    apply();
    return Promise.resolve();
  }

  if (typeof document.startViewTransition !== "function") return fadeTheme(root, apply);

  return revealTheme(root, origin, apply);
}

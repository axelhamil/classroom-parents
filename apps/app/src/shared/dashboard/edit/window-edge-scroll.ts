export interface Pointer {
  clientX: number;
  clientY: number;
}

export interface EdgeScrollOptions {
  band?: number;
  maxStep?: number;
  onScroll?: (pointer: Pointer) => void;
}

export interface WindowEdgeScroll {
  feed(clientX: number, clientY: number): void;
  stop(): void;
  lastPointer(): Pointer | null;
}

const EDGE_BAND_PX = 56;

const MAX_STEP_PX = 18;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function createWindowEdgeScroll(options: EdgeScrollOptions = {}): WindowEdgeScroll {
  const band = options.band ?? EDGE_BAND_PX;
  const maxStep = options.maxStep ?? MAX_STEP_PX;
  let pointer: Pointer | null = null;
  let frame: number | null = null;

  const stepAt = (clientY: number) => {
    const depth = edgeDepth(clientY, band);

    return Math.sign(depth) * Math.ceil(maxStep * Math.min(1, Math.abs(depth) / band));
  };

  const scrollOnce = (from: Pointer): boolean => {
    const step = stepAt(from.clientY);
    if (step === 0) return false;

    const before = window.scrollY;
    window.scrollBy(0, step);
    if (window.scrollY !== before) options.onScroll?.(from);

    return true;
  };

  const loop = () => {
    frame = pointer && scrollOnce(pointer) ? requestAnimationFrame(loop) : null;
  };

  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  return {
    feed(clientX, clientY) {
      pointer = { clientX, clientY };
      if (prefersReducedMotion()) {
        scrollOnce(pointer);
        return;
      }

      if (stepAt(clientY) !== 0) frame ??= requestAnimationFrame(loop);
    },
    stop() {
      stop();
      pointer = null;
    },
    lastPointer: () => pointer,
  };
}

export function pointerOf(event: Event): Pointer | null {
  if (event instanceof MouseEvent) return { clientX: event.clientX, clientY: event.clientY };

  if (typeof TouchEvent === "undefined" || !(event instanceof TouchEvent)) return null;

  const touch = event.touches[0] ?? event.changedTouches[0];

  return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
}

function edgeDepth(clientY: number, band: number): number {
  const { top, bottom } = visibleBounds();
  const intoBottom = clientY - (bottom - band);
  if (intoBottom > 0) return intoBottom;

  const intoTop = top + band - clientY;
  if (intoTop > 0) return -intoTop;

  return 0;
}

function visibleBounds(): { top: number; bottom: number } {
  const viewport = window.visualViewport;
  const top = viewport?.offsetTop ?? 0;

  return { top, bottom: top + (viewport?.height ?? window.innerHeight) };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches;
}

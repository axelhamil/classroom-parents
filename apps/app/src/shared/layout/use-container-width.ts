import { type RefObject, useLayoutEffect, useRef, useState } from "react";

const ROOT_FONT_PX = 16;

/**
 * Whether an element is at least `minRem` wide, kept in sync while it resizes. A block reads the
 * room its container gives it, not the screen: the same agenda lays out the same in a narrow tile
 * of a wide screen and on a phone.
 */
export function useContainerAtLeast<T extends HTMLElement>(
  minRem: number,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [wide, setWide] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => setWide(element.getBoundingClientRect().width >= minRem * ROOT_FONT_PX);
    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [minRem]);

  return [ref, wide];
}

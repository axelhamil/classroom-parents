import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { type Ref, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../libs/utils";

const SCROLL_SETTLE_MS = 800;

const FADE_EDGES = ["top", "bottom"] as const;

type FadeEdge = (typeof FADE_EDGES)[number];

const scrollRegionVariants = cva(
  "-mx-scroll-gutter rounded-inner px-scroll-gutter outline-none focus-visible:ring focus-visible:ring-ring",
  {
    variants: {
      variant: {
        region: "scroll-fade max-h-scroll-region",
        list: "scroll-fade min-h-0 max-h-scroll-region",
        tile: "scroll-fade-tile min-h-0 flex-1",
      },
    },
    defaultVariants: { variant: "region" },
  },
);

interface SectionScrollRegionProps
  extends Omit<React.ComponentProps<"section">, "aria-label">,
    VariantProps<typeof scrollRegionVariants> {
  variant?: "region" | "list" | null;
  /** Accessible name of the region, a landmark of its own. */
  label: string;
}

interface TileScrollRegionProps
  extends Omit<
    React.ComponentProps<"div">,
    "aria-label" | "aria-labelledby" | "role" | "tabIndex"
  > {
  variant: "tile";
  /** Id of the title of the tile: the tile is already the titled section, the region only borrows its name. */
  "aria-labelledby": string;
  /** Edit mode: nothing scrolls, and the scroll position is given back when it ends. */
  inert?: boolean;
}

/**
 * A box that scrolls its overflow, reachable by keyboard, faded by a mask on the edges that still have content.
 *
 * - `region` and `list` are landmarks (`section` named by `label`) that keep the scroll inside the box.
 * - `tile` is the body of a fixed-size tile, between a header of `h-dashboard-header` and an optional footer laid
 *   outside it: it fills what is left (`flex-1 min-h-0`), is a `group` named by the tile title, chains the gesture to
 *   the page at the end of its course, and shows its thin bar only on hover, focus or while scrolling
 *   (`data-scrolling`). Where scroll-driven animations are missing, two sentinels and an `IntersectionObserver` set the
 *   fade edges instead. The forwarded `ref` reads and writes `scrollTop`, so a caller can keep the position across
 *   two mounts; within one mount, `inert` keeps it on its own.
 */
function ScrollRegion(props: SectionScrollRegionProps | TileScrollRegionProps) {
  if (props.variant === "tile") return <TileScrollRegion {...props} />;

  const { label, variant, className, ...rest } = props;

  return (
    <section
      data-slot="scroll-region"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard, WCAG 2.1.1
      tabIndex={0}
      className={cn(scrollRegionVariants({ variant }), className)}
      {...rest}
    />
  );
}

function TileScrollRegion({
  variant,
  className,
  ref,
  inert,
  children,
  ...props
}: TileScrollRegionProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node);
      assignRef(ref, node);
    },
    [ref],
  );
  const fadeFallback = needsFadeFallback();

  useScrollingFlag(element);
  useFadeSentinels(element, fadeFallback);
  useScrollKeptWhileInert(element, inert);

  return (
    <div
      ref={attach}
      data-slot="scroll-region"
      data-variant={variant}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard, WCAG 2.1.1
      tabIndex={0}
      inert={inert}
      className={cn(scrollRegionVariants({ variant }), className)}
      {...props}
    >
      {fadeFallback && <FadeSentinel edge="top" />}
      {children}
      {fadeFallback && <FadeSentinel edge="bottom" />}
    </div>
  );
}

function FadeSentinel({ edge }: { edge: FadeEdge }) {
  return <div aria-hidden data-fade-edge={edge} />;
}

function needsFadeFallback() {
  if (typeof IntersectionObserver === "undefined") return false;

  return typeof CSS === "undefined" || !CSS.supports("animation-timeline: scroll()");
}

function useScrollingFlag(element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return;

    const endsOnScrollEnd = "onscrollend" in element;
    let settleTimer: number | undefined;

    const settle = () => {
      window.clearTimeout(settleTimer);
      element.toggleAttribute("data-scrolling", false);
    };

    const flag = () => {
      element.toggleAttribute("data-scrolling", true);
      if (endsOnScrollEnd) return;

      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, SCROLL_SETTLE_MS);
    };

    element.addEventListener("scroll", flag, { passive: true });
    element.addEventListener("scrollend", settle);

    return () => {
      element.removeEventListener("scroll", flag);
      element.removeEventListener("scrollend", settle);
      window.clearTimeout(settleTimer);
    };
  }, [element]);
}

function useFadeSentinels(element: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    if (!element || !enabled) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) showFadeEdge(element, entry);
      },
      { root: element },
    );

    for (const sentinel of element.querySelectorAll(":scope > [data-fade-edge]")) {
      observer.observe(sentinel);
    }

    return () => observer.disconnect();
  }, [element, enabled]);
}

function showFadeEdge(region: HTMLElement, entry: IntersectionObserverEntry) {
  const edge = FADE_EDGES.find((name) => entry.target.getAttribute("data-fade-edge") === name);
  if (!edge) return;

  const size = entry.isIntersecting ? "0px" : "var(--scroll-fade-size)";
  region.style.setProperty(`--scroll-fade-${edge}`, size);
}

function useScrollKeptWhileInert(element: HTMLElement | null, inert: boolean | undefined) {
  const kept = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!element) return;

    if (inert) {
      kept.current = element.scrollTop;
      return;
    }

    if (kept.current === null) return;

    element.scrollTop = kept.current;
    kept.current = null;
  }, [element, inert]);
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) ref.current = value;
}

export { ScrollRegion };

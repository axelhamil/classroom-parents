import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "./button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "./popover";

interface TourStep {
  target: string;
  title: string;
  body: string;
}

interface TourLabels {
  progress: (current: number, total: number) => string;
  previous: string;
  next: string;
  skip: string;
  finish: string;
}

interface TourProps {
  steps: TourStep[];
  open: boolean;
  onDone: () => void;
  labels: TourLabels;
}

interface PlacedStep extends TourStep {
  element: HTMLElement;
}

const ACTIVE_ATTRIBUTE = "data-tour-active";

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`);
}

function placeSteps(steps: readonly TourStep[]): PlacedStep[] {
  return steps.flatMap((step) => {
    const element = findTarget(step.target);

    return element ? [{ ...step, element }] : [];
  });
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), [tabindex='0']";

function focusableIn(element: HTMLElement): HTMLElement | null {
  return element.matches(FOCUSABLE) ? element : element.querySelector<HTMLElement>(FOCUSABLE);
}

const MIN_ROOM_REM = 12;
const MIN_SIDE_REM = 15;
const EDGE_GAP = 16;
const SIDE_OFFSET = 12;

interface Band {
  top: number;
  bottom: number;
}

function scrollerIn(dialog: Element, element: HTMLElement): Element {
  for (let node = element.parentElement; node && dialog.contains(node); node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
  }

  return dialog;
}

function visibleBand(element: HTMLElement): Band {
  const dialog = element.closest("[role=dialog], [role=alertdialog]");
  if (dialog) {
    const { top, bottom } = scrollerIn(dialog, element).getBoundingClientRect();
    return { top: Math.max(top, 0), bottom: Math.min(bottom, window.innerHeight) };
  }

  const page = getComputedStyle(document.documentElement);

  return {
    top: Number.parseFloat(page.scrollPaddingTop) || 0,
    bottom: window.innerHeight - (Number.parseFloat(page.scrollPaddingBottom) || 0),
  };
}

function remToPx(rem: number): number {
  return rem * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}

type TourSide = "bottom" | "top" | "left" | "right";

function popoverRoom(): number {
  return remToPx(MIN_ROOM_REM) + SIDE_OFFSET + EDGE_GAP;
}

function sideFor(element: HTMLElement): TourSide {
  const rect = element.getBoundingClientRect();
  const band = visibleBand(element);
  if (band.bottom - band.top - rect.height >= remToPx(MIN_ROOM_REM)) return "bottom";

  const sideRoom = remToPx(MIN_SIDE_REM) + SIDE_OFFSET + EDGE_GAP;
  if (rect.left >= sideRoom) return "left";
  if (window.innerWidth - rect.right >= sideRoom) return "right";
  if (element.closest("[role=dialog], [role=alertdialog]") && band.top >= popoverRoom())
    return "top";
  return "bottom";
}

function anchorRect(element: HTMLElement, side: TourSide): DOMRect {
  const rect = element.getBoundingClientRect();
  if (side !== "bottom") return rect;

  const band = visibleBand(element);
  const room = popoverRoom();
  if (rect.top - band.top >= room || band.bottom - rect.bottom >= room) return rect;

  return new DOMRect(rect.left, Math.max(band.bottom - room, band.top), rect.width, 0);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function Tour({ steps, open, onDone, labels }: TourProps) {
  const [placed, setPlaced] = useState<PlacedStep[]>([]);
  const [index, setIndex] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const targets = steps.map((step) => step.target).join("\n");
  const position = Math.min(index, placed.length - 1);
  const current = open ? placed[position] : undefined;
  const element = current?.element;

  useEffect(() => {
    if (!open) {
      setPlaced([]);
      return;
    }

    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      setIndex(0);
      setPlaced(placeSteps(steps));
    });

    let width = window.innerWidth;
    let relayout = 0;
    const onResize = () => {
      if (window.innerWidth === width) return;

      width = window.innerWidth;
      cancelAnimationFrame(relayout);
      relayout = requestAnimationFrame(() => setPlaced(placeSteps(steps)));
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(relayout);
      window.removeEventListener("resize", onResize);
    };
  }, [open, targets]);

  useEffect(() => {
    if (!element) return;

    element.setAttribute(ACTIVE_ATTRIBUTE, "");

    return () => element.removeAttribute(ACTIVE_ATTRIBUTE);
  }, [element]);

  useEffect(() => {
    current?.element.scrollIntoView?.({
      block: "start",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [current]);

  const side = element ? sideFor(element) : "bottom";
  const anchor = useMemo(
    () => ({
      current: element
        ? { getBoundingClientRect: () => anchorRect(element, side), contextElement: element }
        : null,
    }),
    [element, side],
  );

  if (!current) return null;

  const last = position === placed.length - 1;
  const coveredBelow = window.innerHeight - visibleBand(current.element).bottom;

  const back = () => {
    setIndex(position - 1);
    if (position === 1) next.current?.focus();
  };

  const finish = () => {
    onDone();
    const previous = opener.current;
    if (previous?.isConnected && previous !== document.body) previous.focus();
  };

  return (
    <Popover
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) finish();
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        data-slot="tour"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        collisionPadding={{
          top: EDGE_GAP,
          right: EDGE_GAP,
          bottom: EDGE_GAP + coveredBelow,
          left: EDGE_GAP,
        }}
        side={side}
        align={side === "bottom" || side === "top" ? "center" : "start"}
        sideOffset={SIDE_OFFSET}
        className="flex max-h-(--radix-popover-content-available-height) w-80 max-w-(--radix-popover-content-available-width) flex-col gap-4"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          next.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;

          const controls = event.currentTarget.querySelectorAll("button");
          const edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
          const page = focusableIn(current.element);
          if (event.target !== edge || !page) return;

          event.preventDefault();
          page.focus();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <PopoverHeader
          key={current.target}
          data-slot="tour-step"
          aria-live="polite"
          className="min-h-0 overflow-y-auto"
        >
          <PopoverDescription data-slot="tour-progress">
            {labels.progress(position + 1, placed.length)}
          </PopoverDescription>
          <PopoverTitle id={titleId}>{current.title}</PopoverTitle>
          <PopoverDescription id={bodyId}>{current.body}</PopoverDescription>
        </PopoverHeader>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            {labels.skip}
          </Button>
          <div className="ml-auto flex gap-2">
            {position > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={back}>
                {labels.previous}
              </Button>
            )}
            <Button
              ref={next}
              type="button"
              size="sm"
              onClick={() => (last ? finish() : setIndex(position + 1))}
            >
              {last ? labels.finish : labels.next}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { Tour, type TourLabels, type TourStep };

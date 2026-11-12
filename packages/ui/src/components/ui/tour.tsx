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
const EDGE_GAP = 16;

interface Band {
  top: number;
  bottom: number;
}

function visibleBand(): Band {
  const page = getComputedStyle(document.documentElement);

  return {
    top: Number.parseFloat(page.scrollPaddingTop) || 0,
    bottom: window.innerHeight - (Number.parseFloat(page.scrollPaddingBottom) || 0),
  };
}

function anchorRect(element: HTMLElement): DOMRect {
  const rect = element.getBoundingClientRect();
  const band = visibleBand();
  const room =
    MIN_ROOM_REM * (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
  if (rect.top - band.top >= room || band.bottom - rect.bottom >= room) return rect;

  const top = Math.min(Math.max(rect.top, band.top), band.bottom - room);

  return new DOMRect(rect.left, top, rect.width, 0);
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

  const anchor = useMemo(
    () => ({ current: element ? { getBoundingClientRect: () => anchorRect(element) } : null }),
    [element],
  );

  if (!current) return null;

  const last = position === placed.length - 1;
  const coveredBelow = window.innerHeight - visibleBand().bottom;

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
        sideOffset={12}
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
        <div className="flex shrink-0 items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            {labels.skip}
          </Button>
          <div className="flex gap-2">
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

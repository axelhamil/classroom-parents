import { useEffect, useId, useRef, useState } from "react";
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
  const current = open ? placed[index] : undefined;

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

    return () => cancelAnimationFrame(frame);
  }, [open, targets]);

  useEffect(() => {
    const element = current?.element;
    if (!element) return;

    element.setAttribute(ACTIVE_ATTRIBUTE, "");
    element.scrollIntoView?.({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });

    return () => element.removeAttribute(ACTIVE_ATTRIBUTE);
  }, [current?.element]);

  if (!current) return null;

  const last = index === placed.length - 1;
  const anchor = { current: current.element };

  const back = () => {
    setIndex(index - 1);
    if (index === 1) next.current?.focus();
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
        collisionPadding={16}
        sideOffset={12}
        className="flex max-h-(--radix-popover-content-available-height) flex-col gap-4 overflow-y-auto"
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
        <PopoverHeader key={current.target} data-slot="tour-step" aria-live="polite">
          <PopoverDescription data-slot="tour-progress">
            {labels.progress(index + 1, placed.length)}
          </PopoverDescription>
          <PopoverTitle id={titleId}>{current.title}</PopoverTitle>
          <PopoverDescription id={bodyId}>{current.body}</PopoverDescription>
        </PopoverHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            {labels.skip}
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={back}>
                {labels.previous}
              </Button>
            )}
            <Button
              ref={next}
              type="button"
              size="sm"
              onClick={() => (last ? finish() : setIndex(index + 1))}
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

import { CircleIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { type ComponentProps, type FocusEvent, type KeyboardEvent, useRef } from "react";
import { cn } from "../../libs/utils";

const ARROW_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

type ArrowPress = "none" | "held" | "released";

/**
 * Checks the radio an arrow key moves the focus to, whatever the timing. The primitive
 * moves the focus a task after the keydown and checks the radio only if the key is
 * still down by then: a quick tap on a busy main thread (a dialog still mounting, a
 * slow phone) moved the focus without the selection. This root finishes the job only
 * in that late case, so the radio is never checked twice.
 */
function RadioGroup({
  className,
  onKeyDown,
  onKeyUp,
  onFocus,
  onPointerDown,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  const arrow = useRef<ArrowPress>("none");

  const trackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    arrow.current = ARROW_KEYS.includes(event.key) ? "held" : "none";
  };

  const trackKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyUp?.(event);
    if (arrow.current === "held") arrow.current = "released";
  };

  const checkLateFocus = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.(event);
    const released = arrow.current === "released";
    arrow.current = "none";
    const radio = event.target;
    if (!released || !(radio instanceof HTMLButtonElement)) return;

    if (radio.getAttribute("role") === "radio" && radio.getAttribute("aria-checked") === "false")
      radio.click();
  };

  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-3", className)}
      onKeyDown={trackKeyDown}
      onKeyUp={trackKeyUp}
      onFocus={checkLateFocus}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        arrow.current = "none";
      }}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-rest transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-icon-mark -translate-x-1/2 -translate-y-1/2 fill-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

/**
 * A radio drawn as a tile: the whole block is the radio, its content says the choice (an icon
 * and a word, a palette sample and its name). The checked tile takes the 2px selection edge.
 */
function RadioTile({ className, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-tile"
      className={cn(
        "flex min-h-control-lg flex-col items-center justify-center gap-2 rounded-inner border-2 border-transparent bg-surface-container p-block text-small text-foreground outline-none transition-[color,border-color,box-shadow] hover:bg-surface-container-high focus-visible:ring focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:text-primary [&_svg]:size-icon-lg [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export { RadioGroup, RadioGroupItem, RadioTile };

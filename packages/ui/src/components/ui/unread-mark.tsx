import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * The count of unread items pinned to the corner of its control (a bell). Drawn in the
 * action ink, never a child hue nor the urgency amber, so it never reads as a child or a
 * deadline. Decorative: the control carries the count in its accessible name, so the
 * mark is hidden from assistive technology. The parent must be `relative`.
 */
function UnreadCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="unread-count"
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 animate-pop-in items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-foreground tabular-nums ring-2 ring-background",
        className,
      )}
      {...props}
    />
  );
}

/** The dot an unread row carries; its meaning is given to assistive technology by the caller. */
function UnreadDot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="unread-dot"
      aria-hidden
      className={cn("inline-block size-icon-mark shrink-0 rounded-full bg-primary", className)}
      {...props}
    />
  );
}

export { UnreadCount, UnreadDot };

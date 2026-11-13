import { Slot } from "radix-ui";
import type * as React from "react";
import { useId } from "react";

import { cn } from "../../libs/utils";

interface BrandLinkProps extends React.ComponentProps<"a"> {
  asChild?: boolean;
}

function BrandLink({ className, asChild = false, ...props }: BrandLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      data-slot="brand-link"
      className={cn(
        "inline-flex min-h-touch min-w-0 shrink-0 items-center whitespace-nowrap gap-2.5 rounded-md font-display text-base font-bold tracking-tight outline-none focus-visible:ring focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

const SATCHEL_HANDLE = "M24 15v-4a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v4";
const SATCHEL_FLAP =
  "M15 15h34a7 7 0 0 1 7 6.6l.5 8.4C50 35 41 37 32 37S14 35 7.5 30l.5-8.4A7 7 0 0 1 15 15z";
const SATCHEL_BODY =
  "M7.2 35C14 39.4 23 41 32 41s18-1.6 24.8-6l.9 13.3A8 8 0 0 1 49.7 57H14.3a8 8 0 0 1-8-8.7z";
const CLOCK_HANDS = "M32 34v4.5h3.5";

function BrandMark({ className, ...props }: React.ComponentProps<"svg">) {
  const id = `brand${useId().replace(/[^\w-]/g, "")}`;
  const buckleGap = `${id}-gap`;
  const clockFace = `${id}-face`;

  return (
    <svg
      data-slot="brand-mark"
      viewBox="0 0 64 64"
      aria-hidden
      className={cn(
        "size-9 shrink-0 rounded-xl bg-primary p-1.5 text-primary-foreground shadow-raised",
        className,
      )}
      {...props}
    >
      <defs>
        <mask id={buckleGap}>
          <rect width="64" height="64" fill="white" />
          <circle cx="32" cy="38" r="10" fill="black" />
        </mask>
        <mask id={clockFace}>
          <rect width="64" height="64" fill="white" />
          <path
            d={CLOCK_HANDS}
            fill="none"
            stroke="black"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <path
        d={SATCHEL_HANDLE}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <g mask={`url(#${buckleGap})`} fill="currentColor">
        <path d={SATCHEL_FLAP} />
        <path d={SATCHEL_BODY} />
      </g>
      <circle cx="32" cy="38" r="7" className="fill-warning" mask={`url(#${clockFace})`} />
    </svg>
  );
}

export { BrandLink, BrandMark };

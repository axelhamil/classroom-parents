import { cva } from "class-variance-authority";

import { type ChildTone, childHueFill } from "../../libs/child-hue-classes";
import { initialsOf } from "../../libs/initials";
import { cn } from "../../libs/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

const childAvatarVariants = cva("ring-offset-background", {
  variants: {
    tone: {
      1: "ring-child-1",
      2: "ring-child-2",
      3: "ring-child-3",
      4: "ring-child-4",
      5: "ring-child-5",
      6: "ring-child-6",
      7: "ring-child-7",
      8: "ring-child-8",
      9: "ring-child-9",
      10: "ring-child-10",
      11: "ring-child-11",
      12: "ring-child-12",
      13: "ring-child-13",
      14: "ring-child-14",
      15: "ring-child-15",
      16: "ring-child-16",
    },
    size: {
      xs: "size-5 ring-1",
      sm: "size-8 ring-2 ring-offset-2",
      md: "size-11 ring-2 ring-offset-2",
      lg: "size-16 ring-2 ring-offset-2",
    },
  },
  defaultVariants: { size: "md" },
});

const childInitialsVariants = cva("font-semibold text-child-foreground", {
  variants: {
    tone: childHueFill,
    size: {
      xs: "text-2xs",
      sm: "text-xs",
      md: "text-sm",
      lg: "text-xl",
    },
  },
  defaultVariants: { size: "md" },
});

export interface ChildAvatarProps {
  name: string;
  tone: ChildTone;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

function ChildAvatar({ name, tone, src, size, className, label }: ChildAvatarProps) {
  return (
    <Avatar
      data-slot="child-avatar"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(childAvatarVariants({ tone, size }), className)}
    >
      {src && <AvatarImage src={src} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className={childInitialsVariants({ tone, size })}>
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export { ChildAvatar };

import { cva } from "class-variance-authority";

import { initialsOf } from "../../libs/initials";
import { cn } from "../../libs/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

export type ChildTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const childAvatarVariants = cva("ring-2 ring-offset-2 ring-offset-background", {
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
    },
    size: {
      sm: "size-8",
      md: "size-11",
      lg: "size-16",
    },
  },
  defaultVariants: { size: "md" },
});

const childInitialsVariants = cva("font-semibold text-child-foreground", {
  variants: {
    tone: {
      1: "bg-child-1",
      2: "bg-child-2",
      3: "bg-child-3",
      4: "bg-child-4",
      5: "bg-child-5",
      6: "bg-child-6",
      7: "bg-child-7",
      8: "bg-child-8",
    },
    size: {
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
  size?: "sm" | "md" | "lg";
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

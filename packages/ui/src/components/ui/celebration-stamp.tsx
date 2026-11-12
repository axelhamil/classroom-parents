import type * as React from "react";
import { cn } from "../../libs/utils";

function CelebrationStamp({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="celebration-stamp"
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground shadow-sm [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { CelebrationStamp };

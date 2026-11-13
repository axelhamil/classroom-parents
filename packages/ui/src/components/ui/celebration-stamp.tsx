import type * as React from "react";
import { cn } from "../../libs/utils";

interface CelebrationStampProps extends React.ComponentProps<"span"> {
  burst?: boolean;
}

function CelebrationStamp({ className, burst = false, ...props }: CelebrationStampProps) {
  return (
    <span
      data-slot="celebration-stamp"
      data-burst={burst ? "" : undefined}
      aria-hidden
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground shadow-raised [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export { CelebrationStamp };

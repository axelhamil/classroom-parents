import type * as React from "react";
import { cn } from "../../libs/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-control w-full min-w-0 rounded-inner border border-input bg-transparent px-3 py-1 text-body shadow-rest transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-control-sm file:border-0 file:bg-transparent file:text-small file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-small dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring focus-visible:ring-ring",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
      data-slot="input"
    />
  );
}

export { Input };

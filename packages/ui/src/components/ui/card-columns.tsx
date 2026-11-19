import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * Cards of uneven heights laid out in balanced columns with no hole under a short card:
 * 1 column on a phone, 2 on a tablet, 3 on a computer, 4 from about 1800px. Built on CSS
 * multi-column rather than a masonry grid, which only Safari ships in 2026: the reading and
 * tab order is the source order, top to bottom then the next column, with no fallback to keep
 * in step. Cards never split across two columns (`Card` avoids breaks inside itself). Needs a
 * container query parent (`Screen`'s `main`).
 */
function CardColumns({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-columns"
      className={cn(
        "columns-1 gap-6 space-y-6 @2xl:columns-2 @5xl:columns-3 @ultrawide:columns-4",
        className,
      )}
      {...props}
    />
  );
}

export { CardColumns };

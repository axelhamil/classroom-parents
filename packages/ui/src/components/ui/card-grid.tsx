import type * as React from "react";

import { cn } from "../../libs/utils";

/**
 * Cards of the same kind and similar height in rows read left to right: 1 column on a phone,
 * 2 on a tablet, 3 on a computer, 4 from about 1800px, the same steps as `CardColumns`. Renders
 * a list by default (`ul`), each card in an `li`. Needs a container query parent (`Screen`'s
 * `main`).
 */
function CardGrid({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="card-grid"
      className={cn(
        "grid items-start gap-6 @2xl:grid-cols-2 @5xl:grid-cols-3 @ultrawide:grid-cols-4",
        className,
      )}
      {...props}
    />
  );
}

export { CardGrid };

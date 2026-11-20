import type * as React from "react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface IconButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "size" | "asChild" | "aria-label"> {
  label: string;
  accessibleName?: string;
  size?: "icon" | "icon-sm" | "icon-lg";
}

function IconButton({ label, accessibleName, size = "icon", ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size={size} aria-label={accessibleName ?? label} {...props} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export { IconButton };

import clsx, { type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "title", "heading", "body", "small", "meta"],
      radius: ["mark", "inner", "popover", "surface"],
      shadow: ["rest", "raised", "float", "stripe"],
      spacing: [
        "surface",
        "popover",
        "block",
        "control-sm",
        "control",
        "control-lg",
        "icon-mark",
        "icon-sm",
        "icon",
        "icon-lg",
        "nav",
        "app-bar",
        "scroll-region",
        "scroll-gutter",
        "day-gutter",
        "day-gutter-title",
        "print-item",
      ],
    },
  },
});

/**
 * Joins class names and resolves conflicts between them, knowing the role tokens of `globals.css`: without them the merge
 * reads `text-small` as a colour and drops it beside `text-muted-foreground`, and keeps two radii or two heights side by side.
 * A new size, radius, shadow or spacing token in the theme is added here in the same change.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
